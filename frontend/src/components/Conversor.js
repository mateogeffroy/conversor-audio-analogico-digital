import React, { useState, useRef } from 'react';
import '../styles/Conversor.css';
import GraficoEspectro from './GraficoEspectro';

function Conversor() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [exportFormat, setExportFormat] = useState('wav');
  const [targetSampleRate, setTargetSampleRate] = useState('');
  const [targetBitDepth, setTargetBitDepth] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [originalSpectrumData, setOriginalSpectrumData] = useState(null);
  const [processedSpectrumData, setProcessedSpectrumData] = useState(null);
  const [processedAudioPreviewSrc, setProcessedAudioPreviewSrc] = useState(null);
  const [processedAudioInfo, setProcessedAudioInfo] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  
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
        setFeedbackMessage(`Archivo arrastrado: ${file.name}. Revisa las opciones de conversión a continuación.`);
        resetStateForNewAudio();
      } else {
        alert("Por favor, arrastra solo archivos de audio.");
      }
    }
  };

  const sampleRates = [
    { value: '', label: 'Original' }, { value: '8000', label: '8 kHz' }, { value: '16000', label: '16 kHz' }, { value: '44100', label: '44.1 kHz' }, { value: '96000', label: '96 kHz' },
  ];
  const bitDepths = [
    { value: '', label: 'Original' }, { value: '8', label: '8 bits' }, { value: '16', label: '16 bits' }, { value: '24', label: '24 bits' },
  ];

  const resetStateForNewAudio = () => {
    setIsLoading(false);
    setOriginalSpectrumData(null);
    setProcessedSpectrumData(null);
    setProcessedAudioPreviewSrc(null);
    setProcessedAudioInfo(null);
  };
  
  const handleStartRecording = async () => {
    resetStateForNewAudio();
    setFeedbackMessage('');
    try { 
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      const options = { mimeType: 'audio/webm;codecs=opus' };
      mediaRecorderRef.current = new MediaRecorder(stream, MediaRecorder.isTypeSupported(options.mimeType) ? options : undefined);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (event) => audioChunksRef.current.push(event.data);
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current.mimeType });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setAudioBlob(null);
      setUploadedFile(null);
    } catch (err) {
      console.error("Error mic:", err);
      setFeedbackMessage(`Error al acceder al micrófono: ${err.message}`);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
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
    setAudioBlob(null);
    setUploadedFile(null);
    resetStateForNewAudio();
  };

  const handleSubmitAudio = async () => {
    setIsLoading(true);
    resetStateForNewAudio();
    let audioData = audioBlob || uploadedFile;
    if (!audioData) {
      alert("No hay audio grabado o archivo seleccionado para enviar.");
      setIsLoading(false);
      return;
    }
    const inputFileName = audioBlob ? `grabacion.webm` : uploadedFile.name;
    const formData = new FormData();
    formData.append('audio_file', audioData, inputFileName);
    formData.append('export_format', exportFormat);
    if (targetSampleRate) {
      formData.append('sample_rate', targetSampleRate)
    };
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
        const audioSrc = `data:${result.processed_audio_mimetype};base64,${result.processed_audio_base64}`;
        setProcessedAudioPreviewSrc(audioSrc);
        setProcessedAudioInfo({ base64: result.processed_audio_base64, mimetype: result.processed_audio_mimetype, filename: result.download_filename });
      } else {
        throw new Error(result.error || 'Error del servidor.');
      }
    } catch (err) { console.error("Error:", err);
      setFeedbackMessage(`Error: ${err.message}`);
      alert(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadProcessedAudio = () => {
    if (!processedAudioInfo) return;
    const byteCharacters = atob(processedAudioInfo.base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: processedAudioInfo.mimetype });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = processedAudioInfo.filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const originalAudioSrc = audioBlob ? URL.createObjectURL(audioBlob) : (uploadedFile ? URL.createObjectURL(uploadedFile) : null);
  const hasAudio = audioBlob || uploadedFile;

  return (
    <div className="conversor-wrapper">
      {feedbackMessage && <p><strong>{feedbackMessage}</strong></p>}
      {isLoading && <p><strong>Procesando, por favor espera...</strong></p>}

      {/* --- Lógica Principal de Vistas (sólo se muestra una a la vez) --- */}

      {/* VISTA 3: RESULTADOS (Tiene la máxima prioridad) */}
      {/* Se muestra solo si no está cargando y si ya hay un audio procesado. */}
      {!isLoading && processedAudioPreviewSrc && (
          // He cambiado la clase aquí de "div" a "section" por semántica, y le di la clase.
          <section className="resultados-container"> 
            <h2>Resultados del Procesamiento</h2>
            
            {/* 1. Usamos una clase en lugar de estilo en línea */}
            <div className="resultados-grid">

              {/* 2. Damos una clase a cada columna */}
              <div className="resultado-columna">
                <h4>Audio Original</h4>
                {originalAudioSrc && <audio src={originalAudioSrc} controls style={{width: '100%'}}/>}
                {originalSpectrumData && (
                  <GraficoEspectro spectrumData={originalSpectrumData} chartTitle="Espectro Original" />
                )}
              </div>

              <div className="resultado-columna">
                <h4>Audio Procesado</h4>
                <audio src={processedAudioPreviewSrc} controls style={{width: '100%'}}/>
                {processedSpectrumData && (
                  <GraficoEspectro spectrumData={processedSpectrumData} chartTitle="Espectro Procesado" />
                )}
              </div>
              
            </div>

            <div className='results-buttons-container'>
              {/* Aplicamos la clase conversor-boton aquí */}
              <button className='conversor-boton' onClick={handleDownloadProcessedAudio}>
                Descargar Audio Procesado ({processedAudioInfo ? processedAudioInfo.filename.split('.').pop().toUpperCase() : ''})
              </button>
              {/* Este ya tiene la clase secondary-button */}
              <button onClick={handleClearAudio} className="secondary-button">
                Procesar Otro Audio
              </button>
            </div>
          </section>
      )}
      {/* Si no esta cargando audio y no hay audio previsualizado */}
      {/* Si no hay audio muestra los botones de grabar y subir archivo */}
      {/* Si hay audio muestra las opciones de coneversion */}
      {!isLoading && !processedAudioPreviewSrc && (
        <>
          {!hasAudio ? (
            <div className="conversor-container">
              <h2 className='conversor-titulo'>Subir o Grabar Audio</h2>
              <div className='container-botones'>
                <label htmlFor="conversor-boton" className='label-boton'>Grabar audio:</label>
                <button
                  className='conversor-boton'
                  onClick={isRecording ? handleStopRecording : handleStartRecording}
                  // ¡Eliminamos la propiedad 'disabled={isRecording}' de aquí!
                  style={{backgroundColor: isRecording ? 'red' : '#4A90E2'}}
                >
                  {isRecording ? 'Detener Grabación' : 'Iniciar Grabación'}
                </button>
              </div>
              <hr style={{margin: '15px 0'}}/>
              <div 
                className={`drop-zone ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input 
                  type="file" 
                  id="audioUpload" 
                  className="file-input-hidden" 
                  accept="audio/*" 
                  onChange={handleFileChange} 
                  disabled={isRecording} 
                />
                <label htmlFor="audioUpload" className="drop-zone-label">
                  <p>Arrastra tu archivo de audio aquí</p>
                  <p>o</p>
                  <span className="drop-zone-button">Selecciona un archivo</span>
                </label>
              </div>
            </div>
          ) : (
            <>
              <div className="conversor-container">
                {audioBlob && (
                  <>
                    <p>Audio Grabado (Tipo: {audioBlob.type.split('/')[1]?.split(';')[0].toUpperCase()})</p>
                    {/* Contenedor mejorado para el audio grabado */}
                    <div className='audio-player-wrapper'> {/* Nuevo wrapper para el reproductor y botón */}
                      <div className='audio-player-container'>
                        <audio src={originalAudioSrc} controls />
                      </div>
                      <button className='conversor-boton secondary-button' onClick={handleClearAudio}>
                        Cambiar Audio
                      </button>
                    </div>
                  </>
                )}
                {uploadedFile && (
                  <>
                    {/* Contenedor mejorado para el audio subido */}
                    <div className='audio-player-wrapper'> {/* Nuevo wrapper para el reproductor y botón */}
                      <div className='audio-player-container'>
                        <audio src={originalAudioSrc} controls />
                      </div>
                      <button className='conversor-boton secondary-button' onClick={handleClearAudio}>
                        Cambiar Audio
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="conversor-container">
                <h3>Opciones de Conversión</h3>
                <div className="options-row">
                  <div className="form-group">
                    <label htmlFor="sampleRateSelect">Tasa de Muestreo:</label>
                    <select id="sampleRateSelect" value={targetSampleRate} onChange={(e) => setTargetSampleRate(e.target.value)}>
                      {sampleRates.map(rate => (<option key={rate.value} value={rate.value}>{rate.label}</option>))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="bitDepthSelect">Profundidad de Bits:</label>
                    <select id="bitDepthSelect" value={targetBitDepth} onChange={(e) => setTargetBitDepth(e.target.value)}>
                      {bitDepths.map(depth => (<option key={depth.value} value={depth.value}>{depth.label}</option>))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Formato de Exportación:</label>
                    <div className='radio-group'>
                      <label>
                        <input type="radio" name="exportFormat" value="wav" checked={exportFormat === 'wav'} onChange={(e) => setExportFormat(e.target.value)} /> WAV
                      </label>
                      <label>
                        <input type="radio" name="exportFormat" value="mp3" checked={exportFormat === 'mp3'} onChange={(e) => setExportFormat(e.target.value)} /> MP3
                      </label>
                    </div>
                  </div>
                </div>          
                <div className="process-button-container">
                  <button onClick={handleSubmitAudio}>
                    Procesar Audio
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Conversor;