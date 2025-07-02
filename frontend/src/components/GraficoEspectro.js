// frontend/src/GraficoEspectro.js
import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, // Para el eje horizontal (frecuencias)
  LinearScale,   // Para el eje vertical (magnitudes)
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Registramos los componentes de Chart.js que vamos a usar.
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

/*
Componente GraficoEspectro.
Muestra un gráfico de líneas del espectro de frecuencia de un audio.
Recibe datos del espectro y un título para el gráfico.
*/
const GraficoEspectro = ({ spectrumData, chartTitle }) => {
  // Si no hay datos, mostramos un mensaje.
  if (!spectrumData || !spectrumData.frequencies || !spectrumData.magnitudes) {
    return <p>No hay datos de espectro para mostrar.</p>;
  }

  // Preparamos las etiquetas del eje X (frecuencias) para que sean legibles.
  const labels = spectrumData.frequencies.map(f => {
    if (f < 1000) return `${Math.round(f)} Hz`;
    return `${(f / 1000).toFixed(1)} kHz`;
  });
  // Obtenemos las magnitudes para el eje Y.
  const magnitudes = spectrumData.magnitudes;

  // Datos para el gráfico: etiquetas (frecuencias) y el conjunto de datos (magnitudes).
  const data = {
    labels: labels,
    datasets: [
      {
        label: 'Magnitud', // Etiqueta del conjunto de datos.
        data: magnitudes, // Los valores de magnitud.
        borderColor: 'rgb(75, 192, 192)', // Color de la línea del gráfico.
        backgroundColor: 'rgba(75, 192, 192, 0.5)', // Color de fondo del área bajo la línea.
        tension: 0.1, // Suaviza la línea del gráfico.
        pointRadius: 1, // Tamaño de los puntos en la línea.
      },
    ],
  };

  // Opciones de configuración para el gráfico.
  const options = {
    responsive: true, // Hace que el gráfico se adapte al tamaño del contenedor.
    maintainAspectRatio: false, // Permite que el CSS controle el tamaño.
    plugins: {
      legend: {
        position: 'top',
        display: false, // Ocultamos la leyenda ya que solo hay un dataset.
      },
      title: {
        display: true, // Muestra el título del gráfico.
        text: chartTitle || 'Espectro de Frecuencia', // El título que se pasa o uno por defecto.
      },
      tooltip: {
        callbacks: {
          label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                  label += ': ';
              }
              if (context.parsed.y !== null) {
                  label += context.parsed.y.toFixed(2); // Formatea la magnitud.
              }
              return label;
          },
          title: function(context) {
              return `Frecuencia: ${context[0].label}`; // Muestra la frecuencia en el título del tooltip.
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true, // Muestra el título del eje X.
          text: 'Frecuencia', // Título del eje X.
        },
      },
      y: {
        title: {
          display: true, // Muestra el título del eje Y.
          text: 'Magnitud', // Título del eje Y.
        },
        beginAtZero: true, // El eje Y comienza en cero.
      },
    },
  };

  // Renderiza el componente Chart.js Line dentro de un contenedor con altura fija.
  return (
    <div style={{ height: '300px', width: '100%', marginTop: '15px' }}>
      <Line options={options} data={data} />
    </div>
  );
};

export default GraficoEspectro;