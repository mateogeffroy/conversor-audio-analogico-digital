import React from 'react'
import { Link } from 'react-router-dom'
import '../styles/Home.css'

function Home() {
    return (
        <div className="home">
            <h2>Bienvenido al Conversor de Audio</h2>
            <p>Este proyecto demuestra la digitalización de señales de audio.</p>
            <Link to="/conversor" className="home-button">Ir al Conversor</Link>
        </div>
    )
}

export default Home