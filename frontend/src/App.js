import React, { useState, useRef } from 'react';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [exportFormat, setExportFormat] = useState('wav');
  const [targetSampleRate, setTargetSampleRate] = useState('');
  const [targetBitDepth, setTargetBitDepth] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const sampleRates = [
    { value: '', label: 'Original' },
    { value: '8000', label: '8 kHz' },
    { value: '16000', label: '16 kHz' },
    { value: '44100', label: '44.1 kHz' },
    { value: '96000', label: '96 kHz' },
  ];

  const bitDepths = [
    { value: '', label: 'Original' },
    { value: '8', label: '8 bits' },
    { value: '16', label: '16 bits' },
    { value: '24', label: '24 bits' },
  ];

  const handleStartRecording = async () => {
    setFeedbackMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: 'audio/webm;codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.log(options.mimeType + ' no es soportado, usando default.');
        mediaRecorderRef.current = new MediaRecorder(stream);
      } else {
        mediaRecorderRef.current = new MediaRecorder(stream, options);
      }
      
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current.mimeType });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
        setFeedbackMessage('Grabación finalizada.');
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setAudioBlob(null);
      setUploadedFile(null);
      setFeedbackMessage('Grabando...');
    } catch (err) {
      console.error("Error al acceder al micrófono:", err);
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
    setFeedbackMessage('');
    const file = event.target.files[0];
    if (file) {
      setUploadedFile(file);
      setAudioBlob(null);
      setFeedbackMessage(`Archivo seleccionado: ${file.name}`);
    }
  };

  const handleSubmitAudio = async () => {
    setFeedbackMessage('Procesando audio...');
    let audioData = null;
    let inputFileName = "audio_input";

    if (audioBlob) {
      audioData = audioBlob;
      const extension = audioBlob.type.split('/')[1].split(';')[0];
      inputFileName = `grabacion-${new Date().toISOString()}.${extension}`;
    } else if (uploadedFile) {
      audioData = uploadedFile;
      inputFileName = uploadedFile.name;
    } else {
      setFeedbackMessage("No hay audio grabado o archivo seleccionado para enviar.");
      alert("No hay audio grabado o archivo seleccionado para enviar.");
      return;
    }

    const formData = new FormData();
    formData.append('audio_file', audioData, inputFileName);
    formData.append('export_format', exportFormat);
    if (targetSampleRate) {
      formData.append('sample_rate', targetSampleRate);
    }
    if (targetBitDepth) {
      formData.append('bit_depth', targetBitDepth);
    }

    // MODIFICACIÓN AQUÍ: Usar variable de entorno para la URL del backend
    // Si REACT_APP_API_BASE_URL está definida (en el entorno de Render), se usa esa.
    // Si no (en desarrollo local), se usa 'http://localhost:5000'.
    const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
    const uploadUrl = `${apiBaseUrl}/api/upload_audio`;

    try {
      const response = await fetch(uploadUrl, { // Usar la variable uploadUrl
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        let downloadFileName = `processed_audio.${exportFormat}`;
        const disposition = response.headers.get('Content-Disposition');
        if (disposition && disposition.includes('attachment')) {
            const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
            if (filenameMatch && filenameMatch[1]) {
                downloadFileName = filenameMatch[1];
            }
        }
        
        a.download = downloadFileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setFeedbackMessage(`Audio procesado y descargado como ${downloadFileName}.`);
        alert(`Audio procesado y descargado como ${downloadFileName}.`);
      } else {
        const errorResult = await response.json();
        throw new Error(errorResult.error || 'Error al procesar el audio desde el servidor.');
      }
    } catch (err) {
      console.error("Error en el proceso de audio:", err);
      setFeedbackMessage(`Error: ${err.message}`);
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Conversor de Audio Analógico a Digital</h1>
      </header>
      <main>
        {feedbackMessage && <p><strong>{feedbackMessage}</strong></p>}
        
        <h2>1. Grabar o Subir Audio</h2>
        <div>
          <button onClick={handleStartRecording} disabled={isRecording}>
            {isRecording ? 'Grabando...' : 'Iniciar Grabación'}
          </button>
          <button onClick={handleStopRecording} disabled={!isRecording}>
            Detener Grabación
          </button>
        </div>
        {audioBlob && (
          <div>
            <p>Audio Grabado (Tipo: {audioBlob.type})</p>
            <audio src={URL.createObjectURL(audioBlob)} controls />
          </div>
        )}
        <hr />
        <div>
          <label htmlFor="audioUpload">O Subir Archivo de Audio (WAV, MP3, OGG, WEBM, etc.):</label>
          <input 
            type="file" 
            id="audioUpload" 
            accept="audio/*"
            onChange={handleFileChange} 
            disabled={isRecording}
          />
        </div>
        {uploadedFile && (
          <div>
            <p>Archivo Seleccionado: {uploadedFile.name} (Tipo: {uploadedFile.type})</p>
            <audio src={URL.createObjectURL(uploadedFile)} controls />
          </div>
        )}
        
        <hr />
        <h2>2. Opciones de Conversión</h2>
        <div>
          <label htmlFor="sampleRateSelect">Tasa de Muestreo:</label>
          <select 
            id="sampleRateSelect" 
            value={targetSampleRate} 
            onChange={(e) => setTargetSampleRate(e.target.value)}
          >
            {sampleRates.map(rate => (
              <option key={rate.value} value={rate.value}>{rate.label}</option>
            ))}
          </select>
        </div>
        <div style={{ marginTop: '10px' }}>
          <label htmlFor="bitDepthSelect">Profundidad de Bits:</label>
          <select 
            id="bitDepthSelect" 
            value={targetBitDepth} 
            onChange={(e) => setTargetBitDepth(e.target.value)}
          >
            {bitDepths.map(depth => (
              <option key={depth.value} value={depth.value}>{depth.label}</option>
            ))}
          </select>
        </div>
        <div style={{ marginTop: '10px' }}>
          <label>Formato de Exportación:</label>
          <label style={{ marginLeft: '10px' }}>
            <input 
              type="radio" 
              name="exportFormat" 
              value="wav" 
              checked={exportFormat === 'wav'} 
              onChange={(e) => setExportFormat(e.target.value)} 
            /> WAV
          </label>
          <label style={{ marginLeft: '10px' }}>
            <input 
              type="radio" 
              name="exportFormat" 
              value="mp3" 
              checked={exportFormat === 'mp3'} 
              onChange={(e) => setExportFormat(e.target.value)} 
            /> MP3
          </label>
        </div>

        {(audioBlob || uploadedFile) && (
          <button onClick={handleSubmitAudio} style={{marginTop: '20px', padding: '10px'}}>
            Procesar y Descargar Audio ({exportFormat.toUpperCase()})
          </button>
        )}
      </main>
    </div>
  );
}

export default App;