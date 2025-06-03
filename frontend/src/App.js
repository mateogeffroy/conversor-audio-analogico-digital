//frontend/src/App.js
import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    //El backend Flask debe estar corriendo en http://localhost:5000
    fetch('http://localhost:5000/api/hello') //URL completa del endpoint de Flask
      .then(response => {
        if (!response.ok) {
          throw new Error('La respuesta de la red no fue ok');
        }
        return response.json(); //Convierte la respuesta a JSON
      })
      //Manejo de errores
      .then(data => {
        setMessage(data.message);
        setError(null);
      })
      .catch(error => {
        console.error("Error al conectar con el backend:", error);
        setMessage("Error al cargar datos del backend.");
        setError(error.toString()); // Guarda el error en el estado
      });
  }, []);
  //La lista vacía ([]) asegura que useEffect se ejecute solo al cargar el componente

  return (
    <div className="App">
      <header className="App-header">
        <h1>Conversor de Audio Analógico a Digital</h1>
      </header>
      <main>
        <p>Mensaje del Backend: {error ? `Error - ${message}` : message}</p>
        {error && <p style={{ color: 'red' }}>Detalle del error: {error}</p>}
      </main>
    </div>
  );
}

export default App;