import React from 'react';
import { Routes, Route } from 'react-router-dom';
import './styles/App.css';
import Conversor from './components/Conversor';
import Footer from './components/Footer';
import Header from './components/Header';
import Documentacion from './components/Documentacion';
import Biblioteca from './components/Biblioteca';

function App() {
  return (
    <div className='app-div-general'>
      <Header/>
      <main className='app-contenido-principal'>
        <Routes>
          <Route path="/" element={<Conversor />} />
          <Route path="/documentacion" element={<Documentacion />} />
          <Route path="/biblioteca" element={<Biblioteca />} />
        </Routes>
      </main>
      <Footer/>
    </div>
  );
}

export default App;