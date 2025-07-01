// frontend/src/components/Biblioteca.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import GraficoEspectro from './GraficoEspectro';
import '../styles/Biblioteca.css';

function Biblioteca() {
    const [audios, setAudios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedAudio, setSelectedAudio] = useState(null);

    const navigate = useNavigate();

    useEffect(() => {
        const fetchAudios = async () => {
            try {
                const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
                const response = await fetch(`${apiBaseUrl}/api/library`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                setAudios(data);
            } catch (err) {
                setError("No se pudieron cargar los audios. " + err.message);
                console.error("Error fetching library:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchAudios();
    }, []);

    const handleSelectAudio = (audio) => {
        setSelectedAudio(audio);
    };

    const handleBackToList = () => {
        setSelectedAudio(null);
    };

    const handleDownloadFromLibrary = async (audioUrl, filenameBase, format) => {
        const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
        const downloadUrl = `${apiBaseUrl}/api/download_audio?audio_url=${encodeURIComponent(audioUrl)}&format=${format}`;

        try {
            const response = await fetch(downloadUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = `${filenameBase}.${format}`;
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
            console.error(`Error al descargar el audio en formato ${format} desde la biblioteca:`, error);
            alert(`Ocurrió un error al descargar el audio en formato ${format} desde la biblioteca.`);
        }
    };


    if (loading) {
        return <div className="biblioteca-container loading-message">Cargando biblioteca...</div>;
    }

    if (error) {
        return <div className="biblioteca-container error-message">Error: {error}</div>;
    }

    return (
        <div className="biblioteca-wrapper">
            <button className="back-button" onClick={() => navigate('/')}>
                ← Volver al Conversor
            </button>

            {!selectedAudio ? (
                <div className="biblioteca-container">
                    <h2 className='biblioteca-titulo'>Biblioteca de Audios Convertidos Recientes</h2>
                    {audios.length === 0 ? (
                        <p className="empty-message">No hay audios convertidos aún.</p>
                    ) : (
                        <ul className="audio-list">
                            {audios.map((audio) => (
                                <li key={audio.id} className="audio-item" onClick={() => handleSelectAudio(audio)}>
                                    <h3>{audio.nombre_archivo_original || `Audio ${audio.id.substring(0, 8)}`}</h3>
                                    {/* Eliminada la referencia a "Almacenado como: WAV" */}
                                    <p>Fecha: {new Date(audio.fecha_creacion).toLocaleString()}</p>
                                    <button onClick={(e) => { e.stopPropagation(); handleSelectAudio(audio); }} className="view-details-button">
                                        Ver Detalles
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : (
                <div className="selected-audio-details">
                    <button className="back-to-list-button" onClick={handleBackToList}>
                        ← Volver a la lista
                    </button>
                    <h2>Detalles del Audio: {selectedAudio.nombre_archivo_original || `Audio ${selectedAudio.id.substring(0, 8)}`}</h2>

                    <div className="audio-player-section">
                        {/* Título más genérico para el audio almacenado */}
                        <h4>Audio Procesado</h4>
                        <audio controls src={selectedAudio.url_audio_procesado} className="processed-audio-player" />
                        <div className="download-buttons-container">
                            <button className="conversor-boton" onClick={() =>
                                handleDownloadFromLibrary(
                                    selectedAudio.url_audio_procesado,
                                    selectedAudio.nombre_archivo_original || `Audio_${selectedAudio.id.substring(0, 8)}`,
                                    'wav'
                                )
                            }>
                                Descargar como WAV
                            </button>
                            <button className="conversor-boton" onClick={() =>
                                handleDownloadFromLibrary(
                                    selectedAudio.url_audio_procesado,
                                    selectedAudio.nombre_archivo_original || `Audio_${selectedAudio.id.substring(0, 8)}`,
                                    'mp3'
                                )
                            }>
                                Descargar como MP3
                            </button>
                        </div>
                    </div>

                    <div className="options-info-section">
                        <h4>Opciones de Conversión</h4>
                        {/* Eliminada la referencia a "Formato de Exportación" */}
                        <p><strong>Tasa de Muestreo:</strong> {selectedAudio.frecuencia_muestreo ? `${selectedAudio.frecuencia_muestreo / 1000} kHz` : 'Original'}</p>
                        <p><strong>Profundidad de Bits:</strong> {selectedAudio.profundidad_de_bits ? `${selectedAudio.profundidad_de_bits} bits` : 'Original'}</p>
                        <p><strong>Fecha de Conversión:</strong> {selectedAudio.fecha_creacion ? new Date(selectedAudio.fecha_creacion).toLocaleString() : 'N/A'}</p>
                    </div>

                    <div className="spectrum-charts-section">
                        <div className="chart-container">
                            {selectedAudio.espectro_original && (
                                <GraficoEspectro
                                    spectrumData={selectedAudio.espectro_original}
                                    chartTitle="Espectro Original"
                                />
                            )}
                        </div>
                        <div className="chart-container">
                            {selectedAudio.espectro_modificado && (
                                <GraficoEspectro
                                    spectrumData={selectedAudio.espectro_modificado}
                                    chartTitle="Espectro Procesado"
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Biblioteca;