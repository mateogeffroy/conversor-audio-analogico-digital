import React, { useState, useRef } from 'react';
import '../styles/Conversor.css';
import GraficoEspectro from './GraficoEspectro';
import { useNavigate } from 'react-router-dom';

/*
Componente Conversor.
Permite grabar o subir audio, aplicar conversión de tasa de muestreo y profundidad de bits,
y visualizar los espectros de audio original y procesado. También permite descargar el resultado.
*/
function Conversor() {
  //Estados para controlar la grabación de audio.
  const [isRecording, setIsRecording] = useState(false);
  //Almacena el audio grabado como un Blob.
  const [audioBlob, setAudioBlob] = useState(null);
  //Almacena el archivo de audio subido por el usuario.
  const [uploadedFile, setUploadedFile] = useState(null);
  //Tasa de muestreo objetivo para la conversión.
  const [targetSampleRate, setTargetSampleRate] = useState('');
  //Profundidad de bits objetivo para la conversión.
  const [targetBitDepth, setTargetBitDepth] = useState('');
  //Referencia para el objeto MediaRecorder para grabar.
  const mediaRecorderRef = useRef(null);
  //Array para almacenar los trozos de audio grabados.
  const audioChunksRef = useRef([]);
  //Indica si la aplicación está realizando una operación de carga (general).
  const [isLoading, setIsLoading] = useState(false);
  //Datos del espectro de frecuencia del audio original.
  const [originalSpectrumData, setOriginalSpectrumData] = useState(null);
  //Datos del espectro de frecuencia del audio procesado.
  const [processedSpectrumData, setProcessedSpectrumData] = useState(null);
  //URL de previsualización para el audio procesado.
  const [processedAudioPreviewSrc, setProcessedAudioPreviewSrc] = useState(null);
  //Información del audio procesado (ej. URL de Supabase para el WAV).
  const [processedAudioInfo, setProcessedAudioInfo] = useState(null);
  //Estado para el efecto visual de arrastrar y soltar.
  const [isDragging, setIsDragging] = useState(false);
  //Indica si el audio está en proceso de conversión.
  const [isProcessing, setIsProcessing] = useState(false);
  //Hook para la navegación programática.
  const navigate = useNavigate();

  // Opciones disponibles para la tasa de muestreo.
  const sampleRates = [
    { value: '', label: 'Original' }, { value: '8000', label: '8 kHz' }, { value: '16000', label: '16 kHz' }, { value: '44100', label: '44.1 kHz' }, { value: '96000', label: '96 kHz' },
  ];
  // Opciones disponibles para la profundidad de bits.
  const bitDepths = [
    { value: '', label: 'Original' }, { value: '8', label: '8 bits' }, { value: '16', label: '16 bits' }, { value: '24', label: '24 bits' },
  ];

  /*
  Maneja el evento de arrastrar sobre la zona de soltar.
  Activa el indicador visual de arrastre.
  */
  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };
  /*
  Maneja el evento de dejar de arrastrar sobre la zona de soltar.
  Desactiva el indicador visual de arrastre.
  */
  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };
  /*
  Maneja el evento de soltar un archivo.
  Si es un audio, lo establece como el archivo subido.
  */
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

  /*
  Restablece todos los estados relacionados con el audio y el procesamiento
  para preparar una nueva operación.
  */
  const resetStateForNewAudio = () => {
    setIsLoading(false);
    setOriginalSpectrumData(null);
    setProcessedSpectrumData(null);
    setProcessedAudioPreviewSrc(null);
    setProcessedAudioInfo(null);
    setIsProcessing(false);
  };

  /*
  Inicia la grabación de audio desde el micrófono del usuario.
  Configura el MediaRecorder y sus eventos.
  */
  const handleStartRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    resetStateForNewAudio();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current.mimeType });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
      };

      mediaRecorderRef.current.onerror = (event) => {
        console.error("MediaRecorder error:", event.error);
        setIsRecording(false);
        stream.getTracks().forEach(track => track.stop());
        alert("Error al grabar el audio. Asegúrate de que el micrófono esté disponible.");
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error al acceder al micrófono:", err);
      setIsRecording(false);
      alert("No se pudo acceder al micrófono. Por favor, asegúrate de haber otorgado los permisos.");
    }
  };

  /*
  Detiene la grabación de audio en curso.
  */
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  /*
  Maneja la selección de un archivo de audio del sistema del usuario.
  Restablece estados y guarda el archivo.
  */
  const handleFileChange = (event) => {
    resetStateForNewAudio();
    const file = event.target.files[0];
    if (file) {
      setUploadedFile(file);
      setAudioBlob(null);
    }
  };

  /*
  Limpia el audio actual (grabado o subido) y restablece los estados
  para empezar de nuevo. Detiene cualquier grabación activa.
  */
  const handleClearAudio = () => {
    if (isRecording && mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }

    setAudioBlob(null);
    setUploadedFile(null);
    resetStateForNewAudio();
  };

  /*
  Envía el audio seleccionado o grabado al backend para su procesamiento.
  Muestra indicadores de carga y procesamiento.
  */
  const handleSubmitAudio = async () => {
    if (isLoading || isProcessing) return;
    setIsLoading(true);
    setIsProcessing(true);

    let audioData = audioBlob || uploadedFile;
    if (!audioData) {
      alert("Por favor, graba o selecciona un archivo de audio antes de procesar.");
      setIsLoading(false);
      setIsProcessing(false);
      return;
    }

    let inputFileName;
    if (audioBlob) {
        inputFileName = `grabacion_${Date.now()}.webm`;
    } else if (uploadedFile) {
        inputFileName = uploadedFile.name;
    } else {
        return;
    }

    const formData = new FormData();
    formData.append('audio_file', audioData, inputFileName);
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
        const audioSrc = result.processed_audio_url_supabase_wav;
        setProcessedAudioPreviewSrc(audioSrc);
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

  /*
  Maneja la descarga del audio procesado en un formato específico (WAV o MP3).
  Realiza una solicitud al backend para obtener el archivo.
  @param {string} format - El formato deseado para la descarga ('wav' o 'mp3').
  */
  const handleDownloadProcessedAudio = async (format) => {
    if (!processedAudioInfo || !processedAudioInfo.supabaseWavUrl) return;

    const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
    const downloadUrl = `${apiBaseUrl}/api/download_audio?audio_url=${encodeURIComponent(processedAudioInfo.supabaseWavUrl)}&format=${format}`;

    try {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `processed_audio.${format}`;
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

  // Determina la fuente del audio original para la previsualización.
  const originalAudioSrc = audioBlob ? URL.createObjectURL(audioBlob) : (uploadedFile ? URL.createObjectURL(uploadedFile) : null);
  // Verifica si hay un audio cargado o grabado.
  const hasAudio = audioBlob || uploadedFile;

  return (
    <div className="conversor-wrapper">
      {!hasAudio && (
        <div className="biblioteca-link-container">
          <button
            className='conversor-boton conversor-boton-secundario'
            onClick={() => navigate('/biblioteca')}
            disabled={isLoading}
          >
            Ver Biblioteca de Audios
          </button>
        </div>
      )}

      {!isLoading && !processedAudioPreviewSrc && (
        <>
          {!hasAudio ? (
            <div className="conversor-container">
              <h2 className='conversor-titulo'>Subir o Grabar Audio</h2>
              <div className='conversor-container-botones'>
                <button
                  className='conversor-boton'
                  onClick={isRecording ? handleStopRecording : handleStartRecording}
                  style={{ backgroundColor: isRecording ? '#CC0000' : '#8D021F' }}
                  disabled={isLoading}
                >
                  {isRecording ? 'Detener Grabación' : 'Iniciar Grabación'}
                </button>
                <label htmlFor="conversor-boton" className='conversor-label-boton'>{isRecording ? 'Grabando...' : ''}</label>
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
            </div>
          ) : (
            <>
              <div className="conversor-container">
                {audioBlob && (
                  <>
                    <div className='conversor-audio-player-wrapper'>
                      <div className='conversor-audio-player-container'>
                        <h2 className="conversor-titulo">Audio Grabado (Tipo: {audioBlob.type.split('/')[1]?.split(';')[0].toUpperCase()})</h2>
                        <audio className="conversor-audio" src={originalAudioSrc} controls />
                      </div>
                      <button className='conversor-boton conversor-boton-secundario' onClick={handleClearAudio} disabled={isLoading}>
                        Cambiar Audio
                      </button>
                    </div>
                  </>
                )}
                {uploadedFile && (
                  <>
                    <h2 className="conversor-titulo">Archivo Subido: {uploadedFile.name}</h2>
                    <div className='conversor-audio-player-wrapper'>
                      <div className='conversor-audio-player-container'>
                        <audio className="conversor-audio" src={originalAudioSrc} controls />
                      </div>
                      <button className='conversor-boton conversor-boton-secundario' onClick={handleClearAudio} disabled={isLoading}>
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
                  {/* ELIMINADO: Este div del formato de exportación ya no es necesario aquí. */}
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
            <button className='conversor-boton' onClick={() => handleDownloadProcessedAudio('wav')}>
              Descargar WAV
            </button>
            <button className='conversor-boton' onClick={() => handleDownloadProcessedAudio('mp3')}>
              Descargar MP3
            </button>
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