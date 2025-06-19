import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import './styles/App.css';
import Conversor from './components/Conversor';
import Footer from './components/Footer';
import Header from './components/Header';
import Home from './components/Home';

function App() {
  return (
    <div className='app-div-general'>
      <Header/>
      <main className='app-contenido-principal'>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/conversor" element={<Conversor />} />
        </Routes>
      </main>
      <Footer/>
    </div>
  );
}

export default App;