// frontend/src/GraficoEspectro.js
import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, // Para el eje X (frecuencias)
  LinearScale,   // Para el eje Y (magnitudes)
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Registrar los componentes necesarios de Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const GraficoEspectro = ({ spectrumData, chartTitle }) => {
  if (!spectrumData || !spectrumData.frequencies || !spectrumData.magnitudes) {
    return <p>No hay datos de espectro para mostrar.</p>;
  }

  // Limitar las frecuencias a un rango audible y práctico, por ejemplo, hasta 20kHz o 24kHz
  // y formatearlas para las etiquetas.
  const labels = spectrumData.frequencies.map(f => {
    if (f < 1000) return `${Math.round(f)} Hz`;
    return `${(f / 1000).toFixed(1)} kHz`;
  });
  const magnitudes = spectrumData.magnitudes;

  const data = {
    labels: labels, // Eje X: Frecuencias
    datasets: [
      {
        label: 'Magnitud',
        data: magnitudes, // Eje Y: Magnitudes
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        tension: 0.1, // Suavizar la línea
        pointRadius: 1, // Tamaño de los puntos
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false, // Para controlar mejor el tamaño con CSS
    plugins: {
      legend: {
        position: 'top',
        display: false, // Podemos ocultar la leyenda si solo hay un dataset
      },
      title: {
        display: true,
        text: chartTitle || 'Espectro de Frecuencia',
      },
      tooltip: {
        callbacks: {
          label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                  label += ': ';
              }
              if (context.parsed.y !== null) {
                  // Puedes formatear la magnitud aquí si lo deseas
                  label += context.parsed.y.toFixed(2);
              }
              return label;
          },
          title: function(context) {
              // Muestra la frecuencia en el título del tooltip
              return `Frecuencia: ${context[0].label}`;
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Frecuencia',
        },
        // Podríamos querer que el eje X sea logarítmico para audio,
        // pero lineal es más simple para empezar.
        // type: 'logarithmic',
      },
      y: {
        title: {
          display: true,
          text: 'Magnitud',
        },
        // Podríamos querer que el eje Y sea en dB, pero lineal es más simple para empezar.
        // type: 'logarithmic', // Para dB, se necesitaría transformar los datos primero
        beginAtZero: true,
      },
    },
  };

  // Damos un alto fijo al contenedor del gráfico para evitar problemas de renderizado inicial
  return (
    <div style={{ height: '300px', width: '100%', marginTop: '15px' }}>
      <Line options={options} data={data} />
    </div>
  );
};

export default GraficoEspectro;