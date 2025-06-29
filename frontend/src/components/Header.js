import React from 'react'
import { Link } from 'react-router-dom';
import '../styles/Header.css'

function Header() {
  return (
    <header className='header'>
      <a href="/">
        <img src='icon.png' alt='icono' className='header-icono'/>
      </a>
        <h1 className='header-titulo'>Conversor de Audio Analógico a Digital</h1>
        <nav className='header-nav'>
            <Link to="/" className='header-link'>Inicio</Link>
            <Link to="/documentacion" className='header-link'>Documentación</Link>
        </nav>
    </header>
  )
}

export default Header