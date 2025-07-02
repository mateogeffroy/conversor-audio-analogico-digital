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
        <div className="doc-page-wrapper">
            <div className='doc-hero'>
                <div className="hero-content">
                    <h2>Documentación del Conversor de Audio</h2>
                    <p>Comunicación de Datos - S32 - 2025</p>
                    <Link to="/" className="doc-hero-button">Ir al Conversor</Link>
                </div>
                <ArrowDownIcon />
            </div>

            <div className='doc-sections-container'>
                <section className="doc-section">
                    <h2 className="section-title">Frameworks Utilizados</h2>
                    <div className='tech-grid'>
                        <div className='tech-card'>
                            <div className='tech-logo-container'>
                                <img src="/react-logo.png" alt="React Logo"/>
                            </div>
                            <h3>Frontend</h3>
                            <p>Interfaz de usuario interactiva y dinámica.</p>
                        </div>
                        <div className='tech-card'>
                            <div className='tech-logo-container'>
                                <img src="/flask-logo.png" alt="Flask Logo"/>
                            </div>
                            <h3>Backend</h3>
                            <p>Procesamiento de audio y definición de los endpoints.</p>
                        </div>
                    </div>
                </section>

                <section className="doc-section">
                    <h2 className="section-title">Tecnologías de Hosteo</h2>
                    <div className='tech-grid'>
                        <div className='tech-card'>
                            <div className='tech-logo-container'>
                                <img src="/render-logo.png" alt="Render Logo"/>
                            </div>
                            <h3>Gestor de Backend</h3>
                        </div>
                        <div className='tech-card'>
                            <div className='tech-logo-container'>
                                <img src="/vercel-logo.png" alt="Vercel Logo"/>
                            </div>
                            <h3>Gestor de Frontend</h3>
                        </div>
                        <div className='tech-card'>
                            <div className='tech-logo-container'>
                                <img src="/supabase-logo.png" alt="Supabase Logo"/>
                            </div>
                            <h3>Gestor de Base de Datos</h3>
                        </div>
                    </div>
                </section>

                <section className="doc-section">
                    <h2 className="section-title">Herramientas Utilizadas</h2>
                    <div className='tech-grid'>
                        <div className='tech-card'>
                             <div className='tech-logo-container'>
                                <img src="/vsc-logo.png" alt="VSC Logo"/>
                            </div>
                            <h3>Editor de Código</h3>
                        </div>
                        <div className='tech-card'>
                             <div className='tech-logo-container'>
                                <img src="/github-logo.png" alt="Git Logo"/>
                            </div>
                            <h3>Control de Versiones</h3>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

export default Documentacion;