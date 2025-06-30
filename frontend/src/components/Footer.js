import React from 'react'
import '../styles/Footer.css';

function Footer() {
  return (
    <div>
        <footer className='footer'>
            <img src="utn.png" id='logo-utn' alt='Logo de la UTN'/>
            <p className='footer-integrantes'>Integrantes: Buscaglia, Francisco Nicolás - De Paola, Luca - Garrote, Geronimo - Geffroy, Mateo Arturo - Comunicación de datos 2025</p>
        </footer>
    </div>
  )
}

export default Footer