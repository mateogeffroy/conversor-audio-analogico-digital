from flask import Flask, request, jsonify
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
import soundfile as sf # Necesario para la carga del espectro procesado

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

    export_format_req = request.form.get('formato_exportacion', 'wav').lower()
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
        # Usar pydub para cargar el archivo original desde disco (maneja varios formatos via FFmpeg)
        audio_pydub_original = AudioSegment.from_file(temp_filename)

        # Exportar a un buffer WAV para que librosa pueda leerlo de forma confiable
        original_buffer_for_librosa = io.BytesIO()
        audio_pydub_original.export(original_buffer_for_librosa, format="wav")
        original_buffer_for_librosa.seek(0) # Rebobinar el buffer

        # Ahora, librosa puede cargar el WAV del buffer
        # ESTA ES LA LÍNEA QUE FUE CAMBIADA PARA USAR SF.READ Y CAUSÓ PROBLEMAS CON WEBM DIRECTAMENTE
        # y_original, sr_original = librosa.load(original_buffer_for_librosa, sr=None, mono=True)
        # La versión previa que funcionaba con MP3 y daba error de WebM usaba esta línea
        y_original, sr_original = librosa.load(original_buffer_for_librosa, sr=None, mono=True) # SE MANTIENE ESTA LÍNEA

        spectrum_original = get_spectrum_data(y_original, sr_original)

        # La instancia de AudioSegment para el procesamiento será la que cargamos
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
        # Exportar el audio procesado a un buffer WAV para que librosa pueda leerlo
        processed_buffer_for_librosa = io.BytesIO()
        processed_audio_pydub.export(processed_buffer_for_librosa, format="wav")
        processed_buffer_for_librosa.seek(0)

        # Usar soundfile para cargar el WAV del buffer para el espectro (más fiable)
        audio_data_processed, sr_processed = sf.read(processed_buffer_for_librosa)
        y_processed = librosa.to_mono(audio_data_processed) if audio_data_processed.ndim > 1 else audio_data_processed
        spectrum_processed = get_spectrum_data(y_processed, sr_processed)

        # --- EXPORTAR AUDIO FINAL ---
        export_final_buffer = io.BytesIO()
        final_mimetype = ""
        final_download_filename_base = f"processed_{processed_audio_pydub.frame_rate // 1000}kHz_{processed_audio_pydub.sample_width * 8}bit"
        
        if export_format_req == "wav":
            processed_audio_pydub.export(export_final_buffer, format="wav")
            final_mimetype = "audio/wav"
            final_download_filename = f"{final_download_filename_base}.wav"
        elif export_format_req == "mp3":
            processed_audio_pydub.export(export_final_buffer, format="mp3")
            final_mimetype = "audio/mpeg"
            final_download_filename = f"{final_download_filename_base}.mp3"
        else:
            return jsonify({"error": "Formato de exportación no soportado"}), 400
        
        export_final_buffer.seek(0)
        audio_data_to_upload = export_final_buffer.read()

        # --- Guardar en Supabase Storage ---
        supabase_file_name = f"{uuid.uuid4().hex}.{export_format_req}"
        path_in_bucket = f"public/{supabase_file_name}"

        response_upload = supabase.storage.from_("audios-convertidos").upload(
            file=audio_data_to_upload,
            path=path_in_bucket,
            file_options={"content-type": final_mimetype}
        )

        public_audio_url = f"{SUPABASE_URL}/storage/v1/object/public/audios-convertidos/{path_in_bucket}"
        
        app.logger.info(f"Archivo subido a Supabase Storage. URL: {public_audio_url}")

        # --- Guardar metadatos en Supabase Database ---
        data_to_insert = {
            "nombre_archivo_original": nombre_archivo_original,
            "formato_exportacion": export_format_req,
            "frecuencia_muestreo": target_sample_rate_int,
            "profundidad_de_bits": target_bit_depth_int,
            "url_audio_procesado": public_audio_url,
            "espectro_original": spectrum_original,
            "espectro_modificado": spectrum_processed,
        }

        response_insert = supabase.table("audios_convertidos").insert(data_to_insert).execute()

        if response_insert.data:
            audio_base64 = base64.b64encode(audio_data_to_upload).decode('utf-8')

            return jsonify({
                "message": "Audio procesado y almacenado exitosamente.",
                "original_spectrum": spectrum_original,
                "processed_spectrum": spectrum_processed,
                "processed_audio_base64": audio_base64,
                "processed_audio_mimetype": final_mimetype,
                "download_filename": final_download_filename,
                "processed_audio_url_supabase": public_audio_url
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

@app.route('/api/library', methods=['GET'])
def get_converted_audios():
    try:
        response = supabase.table("audios_convertidos") \
            .select("*") \
            .order("created_at", desc=True) \
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