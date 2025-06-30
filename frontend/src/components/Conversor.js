import React, { useState, useRef } from 'react';
import '../styles/Conversor.css';
import GraficoEspectro from './GraficoEspectro';
import { useNavigate } from 'react-router-dom';

function Conversor() {
  //Estados para el manejo dinamico de la webapp

  //Indica si el microfono esta grabando
  const [isRecording, setIsRecording] = useState(false);
  //Almacena el audio grabado como blob y el archivo de audio subido respectivamente
  const [audioBlob, setAudioBlob] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  //Indica el formato de exportacion del audio procesado (seteado por default en .wav)
  const [exportFormat, setExportFormat] = useState('wav');
  //Indica la tasa de muestreo y la profundidad de bits del audio procesado
  const [targetSampleRate, setTargetSampleRate] = useState('');
  const [targetBitDepth, setTargetBitDepth] = useState('');
  //Referencia el media recorder del navegador
  const mediaRecorderRef = useRef(null);
  //Almacena los fragmentos de audio grabados
  const audioChunksRef = useRef([]);
  //Indica si la aplicacion esta en proceso de carga
  const [isLoading, setIsLoading] = useState(false);
  //Estados para manejar los datos del espectro y la previsualizacion del audio procesado
  const [originalSpectrumData, setOriginalSpectrumData] = useState(null);
  const [processedSpectrumData, setProcessedSpectrumData] = useState(null);
  const [processedAudioPreviewSrc, setProcessedAudioPreviewSrc] = useState(null);
  const [processedAudioInfo, setProcessedAudioInfo] = useState(null);
  //Manejo de arrastrar y soltar archivos
  const [isDragging, setIsDragging] = useState(false);
  //indica si se esta procesando el audio
  const [isProcessing, setIsProcessing] = useState(false);
  //Hook para navegar entre rutas
  const navigate = useNavigate();

  //Constantes para las opciones de tasa de muestreo y profundidad de bits
  const sampleRates = [
    { value: '', label: 'Original' }, { value: '8000', label: '8 kHz' }, { value: '16000', label: '16 kHz' }, { value: '44100', label: '44.1 kHz' }, { value: '96000', label: '96 kHz' },
  ];
  const bitDepths = [
    { value: '', label: 'Original' }, { value: '8', label: '8 bits' }, { value: '16', label: '16 bits' }, { value: '24', label: '24 bits' },
  ];

  //Funciones para manejar los eventos

  //Maneja el evento de arrastrar y soltar archivos
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

  //Restablece los estados relacionados con el procesamiento y los resultados del audio
  const resetStateForNewAudio = () => {
    setIsLoading(false);
    setOriginalSpectrumData(null);
    setProcessedSpectrumData(null);
    setProcessedAudioPreviewSrc(null);
    setProcessedAudioInfo(null);
  };

  //Inicia y detiene la grabacion de audio desde el microfono
  const handleStartRecording = async () => {
    resetStateForNewAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: 'audio/webm;codecs=opus' };
      mediaRecorderRef.current = new MediaRecorder(stream, MediaRecorder.isTypeSupported(options.mimeType) ? options : undefined);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (event) => audioChunksRef.current.push(event.data);
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current.mimeType });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop()); // Detiene el stream del micrófono
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setAudioBlob(null);
      setUploadedFile(null);
    } catch (err) {
      console.error("Error mic:", err);
    }
  };
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  //Maneja la seleccion de un archivo de audio mediante el input
  const handleFileChange = (event) => {
    resetStateForNewAudio();
    const file = event.target.files[0];
    if (file) {
      setUploadedFile(file);
      setAudioBlob(null);
    }
  };

  //Limpia el audio subido o grabado volviendo al estado inicial
  const handleClearAudio = () => {
    setAudioBlob(null);
    setUploadedFile(null);
    resetStateForNewAudio();
  };

  //Envia el audio al backend para su procesamiento
  const handleSubmitAudio = async () => {
    //Evita enviar si ya se está procesando o cargando
    if (isLoading) return;
    setIsLoading(true);
    
    let audioData = audioBlob || uploadedFile;
    if (!audioData) {
      return;
    }

    const inputFileName = audioBlob ? `grabacion.webm` : uploadedFile.name;
    const formData = new FormData();
    formData.append('audio_file', audioData, inputFileName);
    formData.append('export_format', exportFormat);
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
        const audioSrc = `data:${result.processed_audio_mimetype};base64,${result.processed_audio_base64}`;
        setProcessedAudioPreviewSrc(audioSrc);
        setProcessedAudioInfo({ base64: result.processed_audio_base64, mimetype: result.processed_audio_mimetype, filename: result.download_filename });
        setIsProcessing(false);
      } else {
        throw new Error(result.error || 'Error del servidor.');
      }
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  //Funcion para descargar el audio procesado
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
  //Indica si hay un audio grabado o subido
  const hasAudio = audioBlob || uploadedFile;

  return (
    <div className="conversor-wrapper">
      {!isLoading && !processedAudioPreviewSrc && (
        <>
          {/*-----------------------------------------------------------------1) Renderizado de la interfaz para grabar o subir audio----------------------------------------------------------------------------*/
          !hasAudio ? (
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
              <div className='container-botones' style={{marginBottom: '20px'}}>
                <button
                  className='conversor-boton secondary-button' // Puedes crear una clase CSS para secondary-button
                  onClick={() => navigate('/biblioteca')}
                  disabled={isLoading}
                >
                  Ver Biblioteca de Audios
                </button>
              </div>
            </div>
          ) : (
            /*----------------------------------------------------2) Renderizado de la interfaz para seleccionar las opciones de conversion---------------------------------------------------------------*/
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
                </div>
                <div className="conversor-process-button-container">
                  <button className='conversor-boton' onClick={() => { handleSubmitAudio(); setIsProcessing(true); }} disabled={isLoading}>Procesar Audio</button>
                </div>
              </div>
            </>
          )}
        </>
      )}
      {/*----------------------------------------------------3) Renderizado de la interfaz de procesamiento---------------------------------------------------------------*/
      isProcessing && (
        <div className="conversor-processing-overlay">
          <span className="conversor-loading-spinner"></span>
          <p className="conversor-processing-text"><strong>Procesando audio, por favor espera...</strong></p>
        </div>
      )}
      {/*----------------------------------------------------4) Renderizado de la interfaz de resultados del procesamiento---------------------------------------------------------------*/
      !isLoading && processedAudioPreviewSrc && (
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
            <button className='conversor-boton' onClick={handleDownloadProcessedAudio}>
              Descargar Audio Procesado ({processedAudioInfo ? processedAudioInfo.filename.split('.').pop().toUpperCase() : ''})
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