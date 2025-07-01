from flask import Flask, request, jsonify, send_file # Añadir send_file
from flask_cors import CORS
import os
from pydub import AudioSegment
import io
import librosa
import numpy as np
import base64
import traceback
from dotenv import load_dotenv
from supabase import create_client, Client
import uuid
import soundfile as sf

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# Configuracion del entorno
app = Flask(__name__)
FRONTEND_URL = os.environ.get('FRONTEND_URL')
if FRONTEND_URL:
    CORS(app, resources={r"/api/*": {"origins": [FRONTEND_URL]}})
else:
    CORS(app)

SUPABASE_URL: str = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY: str = os.environ.get('SUPABASE_SERVICE_KEY')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Función auxiliar para generar datos del espectro
def get_spectrum_data(y, sr, max_points=512):
    if len(y) == 0:
        return {"frequencies": [], "magnitudes": []}
    
    fft_result = np.fft.rfft(y)
    frequencies = np.fft.rfftfreq(len(y), d=1./sr)
    magnitudes = np.abs(fft_result)

    if len(frequencies) > max_points:
        step = len(frequencies) // max_points
        frequencies = frequencies[::step]
        magnitudes = magnitudes[::step]

    return {"frequencies": frequencies.tolist(), "magnitudes": magnitudes.tolist()}

@app.route('/api/upload_audio', methods=['POST'])
def upload_audio():
    if 'audio_file' not in request.files:
        return jsonify({"error": "No se encontró el archivo de audio"}), 400
    
    file = request.files['audio_file']

    if file.filename == '':
        return jsonify({"error": "No se seleccionó ningún archivo"}), 400

    # ELIMINAR O COMENTAR esta línea, ya no necesitamos 'formato_exportacion' aquí
    # export_format_req = request.form.get('formato_exportacion', 'wav').lower() 
    target_sample_rate_str = request.form.get('sample_rate')
    target_bit_depth_str = request.form.get('bit_depth')

    target_sample_rate_int = int(target_sample_rate_str) if target_sample_rate_str else None
    target_bit_depth_int = int(target_bit_depth_str) if target_bit_depth_str else None

    nombre_archivo_original = file.filename
    file_extension = os.path.splitext(nombre_archivo_original)[1]
    if not file_extension and hasattr(file, 'mimetype'):
        if 'webm' in file.mimetype:
            file_extension = ".webm"
        elif 'mp3' in file.mimetype:
            file_extension = ".mp3"
        elif 'wav' in file.mimetype:
            file_extension = ".wav"
    if not file_extension:
        file_extension = ".tmp"

    temp_filename = f"temp_input_audio_{uuid.uuid4().hex}{file_extension}"

    file.save(temp_filename)

    try:
        # --- CARGA DEL AUDIO ORIGINAL PARA ESPECTRO ---
        audio_pydub_original = AudioSegment.from_file(temp_filename)
        original_buffer_for_librosa = io.BytesIO()
        audio_pydub_original.export(original_buffer_for_librosa, format="wav")
        original_buffer_for_librosa.seek(0)

        y_original, sr_original = librosa.load(original_buffer_for_librosa, sr=None, mono=True)
        spectrum_original = get_spectrum_data(y_original, sr_original)

        processed_audio_pydub = audio_pydub_original

        # --- APLICAR OPCIONES DE CONVERSIÓN ---
        if target_sample_rate_int:
            if processed_audio_pydub.frame_rate != target_sample_rate_int:
                processed_audio_pydub = processed_audio_pydub.set_frame_rate(target_sample_rate_int)
        
        if target_bit_depth_int:
            target_sample_width_bytes = target_bit_depth_int // 8
            if target_sample_width_bytes in [1, 2, 4] and processed_audio_pydub.sample_width != target_sample_width_bytes:
                processed_audio_pydub = processed_audio_pydub.set_sample_width(target_sample_width_bytes)
            elif target_bit_depth_int == 24:
                if processed_audio_pydub.sample_width != 3:
                    processed_audio_pydub = processed_audio_pydub.set_sample_width(3)

        # --- GENERAR ESPECTRO DEL AUDIO PROCESADO ---
        processed_buffer_for_librosa = io.BytesIO()
        processed_audio_pydub.export(processed_buffer_for_librosa, format="wav") # Siempre exportar a WAV para el espectro
        processed_buffer_for_librosa.seek(0)

        audio_data_processed, sr_processed = sf.read(processed_buffer_for_librosa)
        y_processed = librosa.to_mono(audio_data_processed) if audio_data_processed.ndim > 1 else audio_data_processed
        spectrum_processed = get_spectrum_data(y_processed, sr_processed)

        # --- SIEMPRE EXPORTAR AUDIO PROCESADO COMO WAV A SUPABASE STORAGE ---
        # Esto asegura que siempre haya una versión de alta calidad disponible
        # para futuras descargas en diferentes formatos.
        final_processed_wav_buffer = io.BytesIO()
        processed_audio_pydub.export(final_processed_wav_buffer, format="wav") # Exportar como WAV
        final_processed_wav_buffer.seek(0)
        audio_data_to_upload_wav = final_processed_wav_buffer.read()

        supabase_file_name = f"{uuid.uuid4().hex}.wav" # Nombre de archivo con extensión .wav
        path_in_bucket = f"public/{supabase_file_name}"
        final_mimetype_for_supabase = "audio/wav"

        response_upload = supabase.storage.from_("audios-convertidos").upload(
            file=audio_data_to_upload_wav, # Subir el WAV
            path=path_in_bucket,
            file_options={"content-type": final_mimetype_for_supabase}
        )

        public_audio_url_wav = f"{SUPABASE_URL}/storage/v1/object/public/audios-convertidos/{path_in_bucket}"
        
        app.logger.info(f"Archivo WAV procesado subido a Supabase Storage. URL: {public_audio_url_wav}")

        # --- Guardar metadatos en Supabase Database ---
        data_to_insert = {
            "nombre_archivo_original": nombre_archivo_original,
            # Ya no guardamos 'formato_exportacion' aquí, ya que siempre es WAV en Storage
            "frecuencia_muestreo": target_sample_rate_int,
            "profundidad_de_bits": target_bit_depth_int,
            "url_audio_procesado": public_audio_url_wav, # URL del WAV guardado
            "espectro_original": spectrum_original,
            "espectro_modificado": spectrum_processed,
            # Asumiendo que 'fecha_creacion' es manejada por defecto en Supabase o se le asigna valor
        }

        response_insert = supabase.table("audios_convertidos").insert(data_to_insert).execute()

        if response_insert.data:
            # Para la previsualización en el frontend, puedes seguir usando base64 del WAV
            audio_base64_wav = base64.b64encode(audio_data_to_upload_wav).decode('utf-8')

            return jsonify({
                "message": "Audio procesado y almacenado exitosamente.",
                "original_spectrum": spectrum_original,
                "processed_spectrum": spectrum_processed,
                "processed_audio_base64": audio_base64_wav, # Ahora es base64 del WAV
                "processed_audio_mimetype": "audio/wav", # El mimetype de la previsualización
                "processed_audio_url_supabase_wav": public_audio_url_wav # Nueva clave para la URL del WAV
            }), 200
        else:
            raise Exception(f"Fallo al guardar metadatos en Supabase Database: {response_insert.json()}")
    
    except Exception as e:
        app.logger.error(f"Error al procesar el audio: {str(e)}")
        app.logger.error(traceback.format_exc())
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
        return jsonify({"error": f"Error interno al procesar el audio. Detalles: {str(e)}"}), 500
    finally:
        if os.path.exists(temp_filename):
            os.remove(temp_filename)

# NUEVA RUTA: Para descargar el audio en formato específico (WAV o MP3)
@app.route('/api/download_audio', methods=['GET'])
def download_audio():
    audio_url = request.args.get('audio_url')
    download_format = request.args.get('format', 'wav').lower() # Default a wav si no se especifica
    
    if not audio_url:
        return jsonify({"error": "URL del audio no proporcionada"}), 400
    
    # Validar que la URL sea de Supabase para evitar SSRF
    if not audio_url.startswith(f"{SUPABASE_URL}/storage/v1/object/public/audios-convertidos/"):
        return jsonify({"error": "URL de audio inválida o no permitida"}), 400

    try:
        # Descargar el archivo WAV desde Supabase Storage
        # El path dentro del bucket se extrae de la URL completa
        path_in_bucket = audio_url.split(f"{SUPABASE_URL}/storage/v1/object/public/audios-convertidos/")[1]
        
        # Usar la API de almacenamiento de Supabase para descargar
        response_download = supabase.storage.from_("audios-convertidos").download(path_in_bucket)
        
        if not response_download:
            return jsonify({"error": "No se pudo descargar el archivo de Supabase Storage."}), 500
        
        audio_data_bytes = io.BytesIO(response_download)
        audio_segment = AudioSegment.from_file(audio_data_bytes, format="wav") # Asumimos que lo descargamos como WAV

        output_buffer = io.BytesIO()
        filename_base = os.path.splitext(os.path.basename(path_in_bucket))[0] # Nombre base del archivo original en storage
        
        if download_format == 'wav':
            audio_segment.export(output_buffer, format="wav")
            mimetype = "audio/wav"
            filename = f"{filename_base}.wav"
        elif download_format == 'mp3':
            audio_segment.export(output_buffer, format="mp3")
            mimetype = "audio/mpeg"
            filename = f"{filename_base}.mp3"
        else:
            return jsonify({"error": "Formato de descarga no soportado"}), 400
        
        output_buffer.seek(0)
        
        # Enviar el archivo al cliente
        return send_file(
            output_buffer,
            mimetype=mimetype,
            as_attachment=True,
            download_name=filename # Usar download_name en lugar de filename para Flask 2.x+
        )

    except Exception as e:
        app.logger.error(f"Error al procesar la descarga de audio: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({"error": f"Error interno al descargar el audio. Detalles: {str(e)}"}), 500

@app.route('/api/library', methods=['GET'])
def get_converted_audios():
    try:
        response = supabase.table("audios_convertidos") \
            .select("*") \
            .order("fecha_creacion", desc=True) \
            .limit(5) \
            .execute()

        if response.data:
            audios = response.data
            return jsonify(audios), 200
        else:
            return jsonify([]), 200 

    except Exception as e:
        app.logger.error(f"Error al obtener la biblioteca de audios: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({"error": f"Error interno al obtener la biblioteca de audios. Detalles: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)