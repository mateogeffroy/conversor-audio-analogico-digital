import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import GraficoEspectro from './GraficoEspectro';
import '../styles/Biblioteca.css';

// Un simple ícono de lápiz en formato SVG que usaremos
const PencilIcon = () => (
    <svg className="pencil-icon" xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="#555555">
      <path d="M0 0h24v24H0z" fill="none"/><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
    </svg>
);

// Funciones auxiliares para manejar nombres de archivo y extensiones
const getFileExtension = (name) => {
    if (!name) return '';
    const lastDot = name.lastIndexOf('.');
    if (lastDot === -1) return '';
    return name.substring(lastDot);
};

const getFileNameWithoutExtension = (name) => {
    if (!name) return '';
    const lastDot = name.lastIndexOf('.');
    if (lastDot === -1) return name;
    return name.substring(0, lastDot);
};

/*
Componente Biblioteca para mostrar y gestionar audios convertidos.
Permite visualizar una lista de audios, ver sus detalles (incluyendo espectros),
descargarlos en diferentes formatos y eliminarlos.
*/
function Biblioteca() {
    //Estado para almacenar la lista de audios
    const [audios, setAudios] = useState([]);
    //Estado para indicar si los audios estan cargando
    const [loading, setLoading] = useState(true);
    //Estado para almacenar cualquier error que ocurra durante la carga o eliminacion
    const [error, setError] = useState(null);
    //Estado para el audio seleccionado actualmente, si se estan viendo sus detalles
    const [selectedAudio, setSelectedAudio] = useState(null);
    
    //Nuevos estados para la funcionalidad de renombrar
    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState("");

    const navigate = useNavigate();

    //Funcion asincronica para obtener la lista de audios desde el backend
    const fetchAudios = useCallback(async () => {
        try {
            setLoading(true);
            const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
            const response = await fetch(`${apiBaseUrl}/api/library`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setAudios(data);
            setError(null);
        } catch (err) {
            setError("No se pudieron cargar los audios. " + err.message);
            console.error("Error fetching library:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    //Efecto para cargar los audios cuando el componente se monta
    useEffect(() => {
        fetchAudios();
    }, [fetchAudios]);

    const handleSelectAudio = (audio) => {
        setSelectedAudio(audio);
        // Al seleccionar un audio, inicializamos el 'newName' con el nombre actual
        setNewName(audio.nombre_archivo_original || '');
        setIsEditingName(false); // Nos aseguramos de no estar en modo edición al principio
    };

    //Maneja el regreso a la vista de la lista de audios desde la vista de detalles
    const handleBackToList = () => {
        setSelectedAudio(null);
        setIsEditingName(false); // Reseteamos el modo edición al volver
    };

    // Nueva función para manejar el guardado del nuevo nombre
    const handleSaveName = async () => {
        if (!selectedAudio || !newName.trim()) return;

        // Evita hacer una llamada a la API si el nombre no ha cambiado
        if (newName.trim() === selectedAudio.nombre_archivo_original) {
            setIsEditingName(false);
            return;
        }

        const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
        const renameUrl = `${apiBaseUrl}/api/rename_audio/${selectedAudio.id}`;

        try {
            const response = await fetch(renameUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newName: newName.trim() })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Error al renombrar');
            }
            
            // Actualizar el estado local para reflejar el cambio inmediatamente
            const updatedAudio = result.updated_audio;
            setSelectedAudio(updatedAudio);

            // Actualizar la lista principal de audios también
            setAudios(prevAudios => prevAudios.map(audio => 
                audio.id === updatedAudio.id ? updatedAudio : audio
            ));

            setIsEditingName(false); // Salir del modo edición
            alert("Nombre actualizado con éxito.");

        } catch (error) {
            console.error("Error al guardar el nuevo nombre:", error);
            alert(`No se pudo actualizar el nombre: ${error.message}`);
        }
    };

    /*
    Maneja la descarga de un audio desde la biblioteca.
    Envía una solicitud al backend para descargar el archivo en el formato especificado.
    */
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
            alert(`Ocurrió un error al descargar el audio en formato ${format}.`);
        }
    };

    //Maneja la eliminación de un audio de la base de datos y Supabase Storage
    const handleDeleteAudio = async (audioId, event) => {
        event.stopPropagation();

        if (!window.confirm("¿Estás seguro de que quieres eliminar este audio? Esta acción es irreversible.")) {
            return;
        }

        try {
            const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
            const response = await fetch(`${apiBaseUrl}/api/delete_audio/${audioId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP error! status: ${response.status} - ${errorData.error || 'Error desconocido'}`);
            }

            alert("Audio eliminado exitosamente.");
            setSelectedAudio(null);
            fetchAudios();
        } catch (err) {
            console.error("Error al eliminar el audio:", err);
            alert(`Ocurrió un error al eliminar el audio: ${err.message}`);
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
             <button className="back-button" onClick={selectedAudio ? handleBackToList : () => navigate('/')}>
                {selectedAudio ? '← Volver a la lista' : '← Volver al Conversor'}
            </button>

            {!selectedAudio ? (
                <div className="biblioteca-container">
                    <h2 className='biblioteca-titulo'>Biblioteca de Audios Convertidos</h2>
                    {audios.length === 0 ? (
                        <p className="empty-message">No hay audios convertidos aún.</p>
                    ) : (
                        <ul className="audio-list">
                            {audios.map((audio) => (
                                <li key={audio.id} className="audio-item" onClick={() => handleSelectAudio(audio)}>
                                    <div className="audio-item-info">
                                        <h3>{audio.nombre_archivo_original || `Audio ${audio.id.substring(0, 8)}`}</h3>
                                        <p>Fecha: {new Date(audio.fecha_creacion).toLocaleString()}</p>
                                    </div>
                                    <div className="audio-item-actions">
                                        <button onClick={(e) => { e.stopPropagation(); handleSelectAudio(audio); }} className="view-details-button">
                                            Ver Detalles
                                        </button>
                                        <button onClick={(e) => handleDeleteAudio(audio.id, e)} className="delete-button">
                                            Eliminar
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : (
                <div className="selected-audio-details">
                    <div className="details-header">
                      {isEditingName ? (
                        <div className="rename-container-editing">
                          <input 
                            type="text"
                            className="rename-input"
                            value={getFileNameWithoutExtension(newName)}
                            onChange={(e) => {
                                const baseName = e.target.value;
                                const extension = getFileExtension(selectedAudio.nombre_archivo_original);
                                setNewName(baseName + extension);
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                            autoFocus
                          />
                          <button className="conversor-boton save-button" onClick={handleSaveName}>Guardar</button>
                        </div>
                      ) : (
                        <h2 className='biblioteca-titulo'>
                          <span>{selectedAudio.nombre_archivo_original || `Audio ${selectedAudio.id.substring(0, 8)}`}</span>
                          <button className="edit-name-button" onClick={() => setIsEditingName(true)}>
                            <PencilIcon />
                          </button>
                        </h2>
                      )}
                    </div>

                    <div className="details-section">
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
                                Descargar WAV
                            </button>
                            <button className="conversor-boton" onClick={() =>
                                handleDownloadFromLibrary(
                                    selectedAudio.url_audio_procesado,
                                    selectedAudio.nombre_archivo_original || `Audio_${selectedAudio.id.substring(0, 8)}`,
                                    'mp3'
                                )
                            }>
                                Descargar MP3
                            </button>
                        </div>
                    </div>

                    <div className="details-section">
                        <h4>Opciones de Conversión</h4>
                        <p><strong>Tasa de Muestreo:</strong> {selectedAudio.frecuencia_muestreo ? `${selectedAudio.frecuencia_muestreo / 1000} kHz` : 'Original'}</p>
                        <p><strong>Profundidad de Bits:</strong> {selectedAudio.profundidad_de_bits ? `${selectedAudio.profundidad_de_bits} bits` : 'Original'}</p>
                        <p><strong>Fecha:</strong> {selectedAudio.fecha_creacion ? new Date(selectedAudio.fecha_creacion).toLocaleString() : 'N/A'}</p>
                    </div>

                    <div className="spectrum-charts-section">
                        {selectedAudio.espectro_original && (
                            <div className="chart-container">
                                <GraficoEspectro
                                    spectrumData={selectedAudio.espectro_original}
                                    chartTitle="Espectro Original"
                                />
                            </div>
                        )}
                        {selectedAudio.espectro_modificado && (
                             <div className="chart-container">
                                <GraficoEspectro
                                    spectrumData={selectedAudio.espectro_modificado}
                                    chartTitle="Espectro Procesado"
                                />
                            </div>
                        )}
                    </div>
                    <div className="selected-audio-details-actions">
                        <button onClick={(e) => handleDeleteAudio(selectedAudio.id, e)} className="delete-button delete-button-large">
                            Eliminar Audio Permanentemente
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Biblioteca;