from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import io
import librosa
import numpy as np
import base64
import traceback
from dotenv import load_dotenv
from supabase import create_client, Client
import uuid
import soundfile as sf
# import pydub # <--- COMENTAR O ELIMINAR ESTA LÍNEA
import subprocess # Para manejar ffmpeg directamente si es necesario, o pydub para MP3 en descarga


load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

app = Flask(__name__)
FRONTEND_URL = os.environ.get('FRONTEND_URL')
if FRONTEND_URL:
    CORS(app, resources={r"/api/*": {"origins": [FRONTEND_URL]}})
else:
    CORS(app)

SUPABASE_URL: str = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY: str = os.environ.get('SUPABASE_SERVICE_KEY')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

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

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok"}), 200

@app.route('/api/upload_audio', methods=['POST'])
def upload_audio():
    if 'audio_file' not in request.files:
        return jsonify({"error": "No se encontró el archivo de audio"}), 400
    
    file = request.files['audio_file']

    if file.filename == '':
        return jsonify({"error": "No se seleccionó ningún archivo"}), 400

    target_sample_rate_str = request.form.get('sample_rate')
    target_bit_depth_str = request.form.get('bit_depth')

    target_sample_rate_int = int(target_sample_rate_str) if target_sample_rate_str else None
    target_bit_depth_int = int(target_bit_depth_str) if target_bit_depth_str else None

    nombre_archivo_original = file.filename
    # No necesitamos file_extension para el formato si librosa/soundfile lo detecta de los bytes
    # o si lo convertimos a WAV primero.

    try:
        audio_bytes = file.read() # Lee todo el contenido del archivo a memoria
        audio_stream = io.BytesIO(audio_bytes)

        # --- CARGA DEL AUDIO ORIGINAL PARA ESPECTRO Y PROCESAMIENTO ---
        # Usar librosa.load directamente. librosa es bueno para inferir formatos si ffmpeg está presente.
        # Asegúrate que el archivo se lea como mono.
        y_original, sr_original = librosa.load(audio_stream, sr=None, mono=True)
        spectrum_original = get_spectrum_data(y_original, sr_original)

        y_processed = y_original
        sr_processed = sr_original

        # --- APLICAR OPCIONES DE CONVERSIÓN ---
        # Remuestreo con librosa.resample
        if target_sample_rate_int and sr_processed != target_sample_rate_int:
            y_processed = librosa.resample(y_processed, orig_sr=sr_processed, target_sr=target_sample_rate_int)
            sr_processed = target_sample_rate_int
        
        # Cuantización con numpy (soundfile maneja los bits al escribir)
        # librosa devuelve float, necesitamos convertir a int para la cuantización si es <= 16 bits
        if target_bit_depth_int:
            if target_bit_depth_int == 8:
                # Convertir a int8 y escalar al rango apropiado
                y_processed = np.int8(y_processed * (2**7 - 1))
                # Luego al escribir con soundfile, podemos especificar dtype='int8'
            elif target_bit_depth_int == 16:
                # Convertir a int16 y escalar al rango apropiado
                y_processed = np.int16(y_processed * (2**15 - 1))
                # Luego al escribir con soundfile, podemos especificar dtype='int16'
            elif target_bit_depth_int == 24:
                # soundfile no tiene un dtype 'int24'. Se maneja con 'int32' y se espera que el codec lo recorte.
                # O pydub es mejor para esto. Mantendremos el float y soundfile lo escalará a int32 para 24 bit
                # Convertir a int32 y escalar al rango apropiado para 24 bits
                y_processed = np.int32(y_processed * (2**23 - 1)) 
            else:
                # Si target_bit_depth_int no es 8, 16, 24, no aplicamos cuantización o manejamos error
                pass # Se mantiene como float para soundfile

        # --- GENERAR ESPECTRO DEL AUDIO PROCESADO ---
        # Aquí y_processed y sr_processed ya están en el estado final después de remuestreo y cuantización conceptual
        spectrum_processed = get_spectrum_data(y_processed, sr_processed)

        # --- SIEMPRE EXPORTAR AUDIO PROCESADO COMO WAV A SUPABASE STORAGE ---
        final_processed_wav_buffer = io.BytesIO()
        
        # Escribir el audio procesado a un buffer WAV usando soundfile
        # soundfile escala los floats a ints para WAV. Para bit_depth, soundfile usa subtype
        sf_subtype = None
        if target_bit_depth_int == 8:
            sf_subtype = 'PCM_S8' # signed 8-bit PCM
        elif target_bit_depth_int == 16:
            sf_subtype = 'PCM_16' # signed 16-bit PCM
        elif target_bit_depth_int == 24:
            sf_subtype = 'PCM_24' # signed 24-bit PCM
        
        # soundfile.write puede aceptar floats en rango [-1, 1] y los escala al rango del subtipo
        # Si y_processed ya se cuantizó manualmente (ej. a int8), pasar el dtype correspondiente
        # Si no se cuantizó manualmente, pasar dtype=None para que soundfile lo determine.
        sf.write(final_processed_wav_buffer, y_processed, sr_processed, format='WAV', subtype=sf_subtype)
        
        final_processed_wav_buffer.seek(0)
        audio_data_to_upload_wav = final_processed_wav_buffer.read()

        supabase_file_name = f"{uuid.uuid4().hex}.wav"
        path_in_bucket = f"public/{supabase_file_name}"
        final_mimetype_for_supabase = "audio/wav"

        response_upload = supabase.storage.from_("audios-convertidos").upload(
            file=audio_data_to_upload_wav,
            path=path_in_bucket,
            file_options={"content-type": final_mimetype_for_supabase}
        )

        public_audio_url_wav = f"{SUPABASE_URL}/storage/v1/object/public/audios-convertidos/{path_in_bucket}"
        
        app.logger.info(f"Archivo WAV procesado subido a Supabase Storage. URL: {public_audio_url_wav}")

        data_to_insert = {
            "nombre_archivo_original": nombre_archivo_original,
            "frecuencia_muestreo": target_sample_rate_int,
            "profundidad_de_bits": target_bit_depth_int,
            "url_audio_procesado": public_audio_url_wav,
            "espectro_original": spectrum_original,
            "espectro_modificado": spectrum_processed,
        }

        response_insert = supabase.table("audios_convertidos").insert(data_to_insert).execute()

        if response_insert.data:
            audio_base64_wav = base64.b64encode(audio_data_to_upload_wav).decode('utf-8')

            return jsonify({
                "message": "Audio procesado y almacenado exitosamente.",
                "original_spectrum": spectrum_original,
                "processed_spectrum": spectrum_processed,
                "processed_audio_base64": audio_base64_wav,
                "processed_audio_mimetype": "audio/wav",
                "processed_audio_url_supabase_wav": public_audio_url_wav
            }), 200
        else:
            raise Exception(f"Fallo al guardar metadatos en Supabase Database: {response_insert.json()}")
    
    except Exception as e:
        app.logger.error(f"Error al procesar el audio: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({"error": f"Error interno al procesar el audio. Detalles: {str(e)}"}), 500

@app.route('/api/download_audio', methods=['GET'])
def download_audio():
    audio_url = request.args.get('audio_url')
    download_format = request.args.get('format', 'wav').lower()
    
    if not audio_url:
        return jsonify({"error": "URL del audio no proporcionada"}), 400
    
    if not audio_url.startswith(f"{SUPABASE_URL}/storage/v1/object/public/audios-convertidos/"):
        return jsonify({"error": "URL de audio inválida o no permitida"}), 400

    try:
        path_in_bucket = audio_url.split(f"{SUPABASE_URL}/storage/v1/object/public/audios-convertidos/")[1]
        
        response_download = supabase.storage.from_("audios-convertidos").download(path_in_bucket)
        
        if not response_download:
            return jsonify({"error": "No se pudo descargar el archivo de Supabase Storage."}), 500
        
        audio_data_bytes = io.BytesIO(response_download)
        
        # Aquí, para manejar la conversión a MP3, vamos a reintroducir una dependencia ligera
        # o ejecutar ffmpeg como subprocess. Si queremos evitar pydub COMPLETAMENTE,
        # la mejor forma para MP3 es ejecutar ffmpeg directamente.

        # Alternativa 1: Ejecutar ffmpeg como subprocess (más robusto para diferentes formatos)
        if download_format == 'mp3':
            # Guardar el WAV descargado temporalmente para ffmpeg
            temp_wav_path = f"/tmp/{uuid.uuid4().hex}.wav"
            with open(temp_wav_path, "wb") as f:
                f.write(audio_data_bytes.getvalue())
            
            output_mp3_path = f"/tmp/{uuid.uuid4().hex}.mp3"
            
            # Comando ffmpeg para convertir WAV a MP3
            # '-i': input file, '-b:a': audio bitrate, '-y': overwrite output file
            command = [
                'ffmpeg',
                '-i', temp_wav_path,
                '-b:a', '192k', # Bitrate de audio, puedes ajustarlo
                '-y', output_mp3_path
            ]
            
            try:
                subprocess.run(command, check=True, capture_output=True)
            except subprocess.CalledProcessError as e:
                app.logger.error(f"FFmpeg conversion error: {e.stderr.decode()}")
                raise Exception("Error en la conversión de MP3 con FFmpeg.")

            with open(output_mp3_path, "rb") as f:
                output_buffer = io.BytesIO(f.read())
            
            os.remove(temp_wav_path)
            os.remove(output_mp3_path)
            
            mimetype = "audio/mpeg"
            filename_base = os.path.splitext(os.path.basename(path_in_bucket))[0]
            filename = f"{filename_base}.mp3"

        elif download_format == 'wav':
            output_buffer = audio_data_bytes # El buffer ya es WAV
            mimetype = "audio/wav"
            filename_base = os.path.splitext(os.path.basename(path_in_bucket))[0]
            filename = f"{filename_base}.wav"
        else:
            return jsonify({"error": "Formato de descarga no soportado"}), 400
        
        output_buffer.seek(0)
        
        return send_file(
            output_buffer,
            mimetype=mimetype,
            as_attachment=True,
            download_name=filename
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