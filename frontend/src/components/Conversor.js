import React, { useState, useRef } from 'react';
import '../styles/Conversor.css';
import GraficoEspectro from './GraficoEspectro';
import { useNavigate } from 'react-router-dom';

function Conversor() {
  //Estados para el manejo dinamico de la webapp
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  // ELIMINAR O COMENTAR esta línea, ya no necesitamos exportFormat aquí
  // const [exportFormat, setExportFormat] = useState('wav'); 
  const [targetSampleRate, setTargetSampleRate] = useState('');
  const [targetBitDepth, setTargetBitDepth] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [isLoading, setIsLoading] = useState(false);
  const [originalSpectrumData, setOriginalSpectrumData] = useState(null);
  const [processedSpectrumData, setProcessedSpectrumData] = useState(null);
  const [processedAudioPreviewSrc, setProcessedAudioPreviewSrc] = useState(null);
  // processedAudioInfo ahora solo necesita la URL del WAV procesado en Supabase
  const [processedAudioInfo, setProcessedAudioInfo] = useState(null); 
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const navigate = useNavigate();

  const sampleRates = [
    { value: '', label: 'Original' }, { value: '8000', label: '8 kHz' }, { value: '16000', label: '16 kHz' }, { value: '44100', label: '44.1 kHz' }, { value: '96000', label: '96 kHz' },
  ];
  const bitDepths = [
    { value: '', label: 'Original' }, { value: '8', label: '8 bits' }, { value: '16', label: '16 bits' }, { value: '24', label: '24 bits' },
  ];

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('audio/')) {
        setUploadedFile(file);
        setAudioBlob(null);
        resetStateForNewAudio();
      } else {
        alert("Por favor, arrastra solo archivos de audio.");
      }
    }
  };

  const resetStateForNewAudio = () => {
    setIsLoading(false);
    setOriginalSpectrumData(null);
    setProcessedSpectrumData(null);
    setProcessedAudioPreviewSrc(null);
    setProcessedAudioInfo(null);
    // Asegurarse de que el procesamiento también se resetee
    setIsProcessing(false);
  };

  const handleStartRecording = async () => {
    // Es crucial detener cualquier stream anterior antes de solicitar uno nuevo
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    resetStateForNewAudio(); // Limpiar estados anteriores ANTES de grabar

    try {
      // Solicitar stream del micrófono
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Guardar el stream en la referencia para poder detenerlo más tarde
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' }); // Define options aquí mismo

      audioChunksRef.current = []; // Limpiar chunks anteriores
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current.mimeType });
        setAudioBlob(blob);
        // Detener el stream del micrófono una vez que la grabación ha finalizado
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false); // Asegurarse de que el estado de grabación se actualice
      };

      mediaRecorderRef.current.onerror = (event) => {
        console.error("MediaRecorder error:", event.error);
        setIsRecording(false);
        // También detén el stream en caso de error
        stream.getTracks().forEach(track => track.stop());
        alert("Error al grabar el audio. Asegúrate de que el micrófono esté disponible.");
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      // No limpiar audioBlob/uploadedFile aquí, ya se hizo en resetStateForNewAudio()
    } catch (err) {
      console.error("Error al acceder al micrófono:", err);
      setIsRecording(false); // Asegúrate de restablecer el estado si falla el acceso
      alert("No se pudo acceder al micrófono. Por favor, asegúrate de haber otorgado los permisos.");
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      // El setIsRecording(false) y stream.getTracks().forEach(track => track.stop());
      // ahora se manejan en el onstop del MediaRecorder, lo que es más robusto.
    }
  };

  const handleFileChange = (event) => {
    resetStateForNewAudio();
    const file = event.target.files[0];
    if (file) {
      setUploadedFile(file);
      setAudioBlob(null);
    }
  };

  const handleClearAudio = () => {
    // Asegurarse de detener cualquier grabación activa antes de limpiar
    if (isRecording && mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
    }
    // Detener cualquier stream del micrófono que pueda estar activo (después de grabación)
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) { // Check for stream property
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }

    setAudioBlob(null);
    setUploadedFile(null);
    resetStateForNewAudio();
  };

  const handleSubmitAudio = async () => {
    if (isLoading || isProcessing) return; // Evita envíos múltiples si ya se está cargando o procesando
    setIsLoading(true); // Activa el estado de carga general
    setIsProcessing(true); // Activa el estado de procesamiento específico

    let audioData = audioBlob || uploadedFile;
    if (!audioData) {
      // Puedes añadir un mensaje al usuario aquí
      alert("Por favor, graba o selecciona un archivo de audio antes de procesar.");
      setIsLoading(false);
      setIsProcessing(false);
      return;
    }

    // Asegurarse de que el inputFileName tenga una extensión
    let inputFileName;
    if (audioBlob) {
        // Para grabaciones, usa un nombre con extensión webm
        inputFileName = `grabacion_${Date.now()}.webm`;
    } else if (uploadedFile) {
        inputFileName = uploadedFile.name;
    } else {
        // Esto no debería pasar si audioData ya fue verificado
        return;
    }

    const formData = new FormData();
    formData.append('audio_file', audioData, inputFileName); // Asegúrate de que el tercer argumento (filename) tenga extensión
    // ELIMINAR O COMENTAR esta línea, ya no necesitamos enviar export_format aquí
    // formData.append('export_format', exportFormat); 
    if (targetSampleRate) {
      formData.append('sample_rate', targetSampleRate);
    }
    if (targetBitDepth) {
      formData.append('bit_depth', targetBitDepth);
    }

    const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
    const processUrl = `${apiBaseUrl}/api/upload_audio`;

    try {
      const response = await fetch(processUrl, { method: 'POST', body: formData });
      const result = await response.json();

      if (response.ok) {
        setOriginalSpectrumData(result.original_spectrum);
        setProcessedSpectrumData(result.processed_spectrum);
        // processed_audio_url_supabase_wav es la nueva clave para la URL del WAV en Supabase
        const audioSrc = result.processed_audio_url_supabase_wav; 
        setProcessedAudioPreviewSrc(audioSrc);
        // processedAudioInfo ahora solo necesita la URL del WAV en Supabase
        setProcessedAudioInfo({ 
            supabaseWavUrl: result.processed_audio_url_supabase_wav 
        });
      } else {
        alert(`Error del servidor: ${result.error || 'Ocurrió un error desconocido.'}`);
        throw new Error(result.error || 'Error del servidor.');
      }
    } catch (err) {
      console.error("Error en handleSubmitAudio:", err);
      if (!err.message.startsWith("Error del servidor:")) {
          alert("Ocurrió un error al procesar el audio. Por favor, inténtalo de nuevo.");
      }
      setProcessedAudioPreviewSrc(null);
      setOriginalSpectrumData(null);
      setProcessedSpectrumData(null);
      setProcessedAudioInfo(null);
    } finally {
      setIsLoading(false);
      setIsProcessing(false);
    }
  };

  // NUEVA FUNCIÓN: Para manejar la descarga de audio en un formato específico
  const handleDownloadProcessedAudio = async (format) => {
    if (!processedAudioInfo || !processedAudioInfo.supabaseWavUrl) return;

    const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
    const downloadUrl = `${apiBaseUrl}/api/download_audio?audio_url=${encodeURIComponent(processedAudioInfo.supabaseWavUrl)}&format=${format}`;

    try {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Obtener el nombre de archivo del encabezado Content-Disposition
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `processed_audio.${format}`; // Fallback filename
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="(.+)"/);
            if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1];
            }
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

    } catch (error) {
        console.error(`Error al descargar el audio en formato ${format}:`, error);
        alert(`Ocurrió un error al descargar el audio en formato ${format}.`);
    }
  };

  const originalAudioSrc = audioBlob ? URL.createObjectURL(audioBlob) : (uploadedFile ? URL.createObjectURL(uploadedFile) : null);
  const hasAudio = audioBlob || uploadedFile;

  return (
    <div className="conversor-wrapper">
      {!isLoading && !processedAudioPreviewSrc && (
        <>
          {!hasAudio ? (
            <div className="conversor-container">
              <h2 className='conversor-titulo'>Subir o Grabar Audio</h2>
              <div className='conversor-container-botones'>
                <label htmlFor="conversor-boton" className='conversor-label-boton'>Grabar audio:</label>
                <button
                  className='conversor-boton'
                  onClick={isRecording ? handleStopRecording : handleStartRecording}
                  style={{ backgroundColor: isRecording ? 'red' : '#4A90E2' }}
                  disabled={isLoading}
                >
                  {isRecording ? 'Detener Grabación' : 'Iniciar Grabación'}
                </button>
              </div>
              <hr className='conversor-hr' />
              <div
                className={`conversor-drop-zone ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  id="audioUpload"
                  className="conversor-file-input"
                  accept="audio/*"
                  onChange={handleFileChange}
                  disabled={isRecording || isLoading}
                />
                <label htmlFor="audioUpload" className="conversor-drop-zone-label">
                  <p className="conversor-drop-text">Arrastra tu archivo de audio aquí</p>
                  <p className="conversor-drop-text">o</p>
                  <span className="conversor-drop-zone-button">Selecciona un archivo</span>
                </label>
              </div>
              <div className='conversor-container-botones' style={{marginBottom: '20px'}}>
                <button
                  className='conversor-boton conversor-boton-secundario' // Usa la clase de botón secundario que ya tienes en CSS
                  onClick={() => navigate('/biblioteca')}
                  disabled={isLoading}
                >
                  Ver Biblioteca de Audios
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="conversor-container">
                {audioBlob && (
                  <>
                    <p className="conversor-texto">Audio Grabado (Tipo: {audioBlob.type.split('/')[1]?.split(';')[0].toUpperCase()})</p>
                    <div className='conversor-audio-player-wrapper'>
                      <div className='conversor-audio-player-container'>
                        <audio className="conversor-audio" src={originalAudioSrc} controls />
                      </div>
                      <button className='conversor-boton' onClick={handleClearAudio} disabled={isLoading}>
                        Cambiar Audio
                      </button>
                    </div>
                  </>
                )}
                {uploadedFile && (
                  <>
                    <p className="conversor-texto">Archivo Subido: {uploadedFile.name}</p>
                    <div className='conversor-audio-player-wrapper'>
                      <div className='conversor-audio-player-container'>
                        <audio className="conversor-audio" src={originalAudioSrc} controls />
                      </div>
                      <button className='conversor-boton' onClick={handleClearAudio} disabled={isLoading}>
                        Cambiar Audio
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="conversor-container">
                <h3 className="conversor-subtitulo">Opciones de Conversión</h3>
                <div className="conversor-options-row">
                  <div className="conversor-form-group">
                    <label className="conversor-label" htmlFor="sampleRateSelect">Tasa de Muestreo:</label>
                    <select className="conversor-select" id="sampleRateSelect" value={targetSampleRate} onChange={(e) => setTargetSampleRate(e.target.value)} disabled={isLoading}>
                      {sampleRates.map(rate => (<option key={rate.value} value={rate.value}>{rate.label}</option>))}
                    </select>
                  </div>
                  <div className="conversor-form-group">
                    <label className="conversor-label" htmlFor="bitDepthSelect">Profundidad de Bits:</label>
                    <select className="conversor-select" id="bitDepthSelect" value={targetBitDepth} onChange={(e) => setTargetBitDepth(e.target.value)} disabled={isLoading}>
                      {bitDepths.map(depth => (<option key={depth.value} value={depth.value}>{depth.label}</option>))}
                    </select>
                  </div>
                  {/* ELIMINAR O COMENTAR este div del formato de exportación */}
                  {/*
                  <div className="conversor-form-group">
                    <label className="conversor-label">Formato de Exportación:</label>
                    <div className='conversor-radio-group'>
                      <label className="conversor-radio-label">
                        <input className="conversor-radio" type="radio" name="exportFormat" value="wav" checked={exportFormat === 'wav'} onChange={(e) => setExportFormat(e.target.value)} disabled={isLoading} /> WAV
                      </label>
                      <label className="conversor-radio-label">
                        <input className="conversor-radio" type="radio" name="exportFormat" value="mp3" checked={exportFormat === 'mp3'} onChange={(e) => setExportFormat(e.target.value)} disabled={isLoading} /> MP3
                      </label>
                    </div>
                  </div>
                  */}
                </div>
                <div className="conversor-process-button-container">
                  <button className='conversor-boton' onClick={() => { handleSubmitAudio(); setIsProcessing(true); }} disabled={isLoading}>Procesar Audio</button>
                </div>
              </div>
            </>
          )}
        </>
      )}
      {isProcessing && (
        <div className="conversor-processing-overlay">
          <span className="conversor-loading-spinner"></span>
          <p className="conversor-processing-text"><strong>Procesando audio, por favor espera...</strong></p>
        </div>
      )}
      {!isLoading && processedAudioPreviewSrc && (
        <section className="conversor-resultados-container">
          <h2 className='conversor-titulo'>Resultados del Procesamiento</h2>

          <div className="conversor-resultados-grid">
            <div className="conversor-resultado-columna">
              <h4 className="conversor-subtitulo">Audio Original</h4>
              {originalAudioSrc && <audio className="conversor-audio" src={originalAudioSrc} controls />}
              {originalSpectrumData && (
                <GraficoEspectro spectrumData={originalSpectrumData} chartTitle="Espectro Original" />
              )}
            </div>

            <div className="conversor-resultado-columna">
              <h4 className="conversor-subtitulo">Audio Procesado</h4>
              <audio className="conversor-audio" src={processedAudioPreviewSrc} controls />
              {processedSpectrumData && (
                <GraficoEspectro spectrumData={processedSpectrumData} chartTitle="Espectro Procesado" />
              )}
            </div>
          </div>

          <div className='conversor-container-botones'>
            {/* NUEVOS BOTONES DE DESCARGA */}
            <button className='conversor-boton' onClick={() => handleDownloadProcessedAudio('wav')}>
              Descargar WAV
            </button>
            <button className='conversor-boton' onClick={() => handleDownloadProcessedAudio('mp3')}>
              Descargar MP3
            </button>
            {/* FIN NUEVOS BOTONES DE DESCARGA */}
            <button className="conversor-boton-secundario" onClick={handleClearAudio}>
              Procesar Otro Audio
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

export default Conversor;