import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../styles/Header.css';

function Header() {
  const location = useLocation();

  return (
    <header className='header'>
      <a href="/">
        <img src='icon.png' alt='icono' className='header-icono'/>
      </a>
      <h1 className='header-titulo'>Conversor de Audio Analógico a Digital</h1>
      <nav className='header-nav'>
        {location.pathname !== '/' && (
          <Link to="/" className='header-link'>Conversor</Link>
        )}
        {location.pathname !== '/documentacion' && (
          <Link to="/documentacion" className='header-link'>Documentación</Link>
        )}
        {location.pathname !== '/biblioteca' && (
          <Link to="/biblioteca" className='header-biblioteca-button'>
            Biblioteca de audios
          </Link>
        )}
      </nav>
    </header>
  )
}

export default Header;