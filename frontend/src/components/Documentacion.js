import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/Documentacion.css';

/*
Componente ArrowDownIcon.
Representa un ícono de flecha hacia abajo.
*/
const ArrowDownIcon = () => (
    <svg 
        className="scroll-arrow" 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 24 24" 
        fill="currentColor"
    >
        <path d="M12 21l-8-8 1.41-1.41L11 17.17V3h2v14.17l5.59-5.58L20 13z"/>
    </svg>
);

/*
Componente Documentacion.
Muestra información sobre el proyecto, tecnologías y herramientas utilizadas.
*/
function Documentacion() {
    return (
        <div className="home">
            <div className='home-hero'>
                <div className="hero-content">
                    <h2>Documentacion del Conversor de Audio</h2>
                    <p>Comunicación de Datos - S32 - 2025</p>
                    <Link to="/" className="home-button">Ir al Conversor</Link>
                </div>
                <ArrowDownIcon />
            </div>

            <div className='container-tecnologias'>
                <h1>Frameworks utilizados</h1>
                <div className='tecnologias-utilizadas'>
                    <div className='react-div'>
                        <div className='react-logo'>
                            <img src="/react-logo.png" alt="React Logo"/>
                        </div>
                        <h3>Frontend</h3>
                        <p>Interfaz de usuario interactiva y dinámica.</p>
                    </div>
                    <div className='flask-div'>
                        <div className='flask-logo'>
                            <img src="/flask-logo.svg" alt="Flask Logo"/>
                        </div>
                        <h3>Backend</h3>
                        <p>Procesamiento de audio y definición de los endpoints.</p>
                    </div>
                </div>
                <h1>Tecnologías de hosteo</h1>
                <div className='tecnologias-hosting'>
                    <div className='render-div'>
                        <div className='render-logo'>
                            <img src="/render-logo.png" alt="Render Logo"/>
                        </div>
                        <h3>Gestor de backend</h3>
                    </div>
                    <div className='vercel-div'>
                        <div className='vercel-logo'>
                            <img src="/vercel-logo.png" alt="Vercel Logo"/>
                        </div>
                        <h3>Gestor de frontend</h3>
                    </div>
                    <div className='supabase-div'>
                        <div className='supabase-logo'>
                            <img src="/supabase-logo.png" alt="Supabase Logo"/>
                        </div>
                        <h3>Gestor de base de datos</h3>
                    </div>
                </div>
                <h1>Herramientas utilizadas</h1>
                <div className='herramientas-utilizadas'>
                    <div className='vsc-div'>
                        <img src="/vsc-logo.png" alt="VSC Logo"/>
                        <h2>Editor de código</h2>
                    </div>
                    <div className='git-div'>
                        <img src="/github-logo.png" alt="Git Logo"/>
                        <h2>Control de Versiones</h2>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Documentacion;