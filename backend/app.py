from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import io
# Eliminados librosa y pydub
import numpy as np
import base64
import traceback
from dotenv import load_dotenv
from supabase import create_client, Client
import uuid
import soundfile as sf
import subprocess

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

# Función auxiliar para generar datos del espectro
# Usa numpy.fft, que es muy eficiente.
def get_spectrum_data(y, sr, max_points=512):
    if len(y) == 0:
        return {"frequencies": [], "magnitudes": []}
    
    # Asegurarse de que y sea un array de numpy si no lo es ya
    y_np = np.array(y)
    
    fft_result = np.fft.rfft(y_np)
    frequencies = np.fft.rfftfreq(len(y_np), d=1./sr)
    magnitudes = np.abs(fft_result)

    if len(frequencies) > max_points:
        step = len(frequencies) // max_points
        frequencies = frequencies[::step]
        magnitudes = magnitudes[::step]

    return {"frequencies": frequencies.tolist(), "magnitudes": magnitudes.tolist()}

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok"}), 200

@app.route('/api/delete_audio/<string:audio_id>', methods=['DELETE'])
def delete_audio(audio_id):
    try:
        # 1. Obtener la URL del audio procesado del registro de la base de datos
        # para saber qué archivo eliminar del Storage.
        response_select = supabase.table("audios_convertidos").select("url_audio_procesado").eq("id", audio_id).single().execute()
        
        if not response_select.data:
            return jsonify({"error": "Audio no encontrado en la base de datos."}), 404
        
        audio_url_to_delete = response_select.data.get("url_audio_procesado")
        
        if not audio_url_to_delete:
            return jsonify({"error": "URL de audio no encontrada para el registro."}), 500

        # Extraer el nombre del archivo del bucket de la URL
        # URL ejemplo: https://<project_id>.supabase.co/storage/v1/object/public/audios-convertidos/public/<uuid>.wav
        path_segments = audio_url_to_delete.split('/')
        if 'audios-convertidos' not in path_segments:
             return jsonify({"error": "URL de Storage inválida."}), 400
        
        # El path_in_bucket es todo lo que viene después de 'audios-convertidos/public/'
        # Asegurarse de que el path sea correcto para Supabase Storage (sin el 'public/' extra si no es parte del path real en el bucket)
        # Vamos a reconstruirlo de forma más segura o extraerlo del final
        
        # Una forma más segura de obtener el path real dentro del bucket 'audios-convertidos'
        # Supabase suele almacenar en "public/<filename>", así que el path para delete es "public/<filename>"
        try:
            # Encuentra el índice de 'audios-convertidos' y 'public' si existen
            bucket_index = path_segments.index('audios-convertidos')
            object_public_index = path_segments.index('public', bucket_index + 1)
            # El path real dentro del bucket es lo que sigue después de 'audios-convertidos/public/'
            file_path_in_bucket = '/'.join(path_segments[object_public_index:])
        except ValueError:
            return jsonify({"error": "Formato de URL de Storage no reconocido."}), 400

        # 2. Eliminar el archivo de Supabase Storage
        response_delete_storage = supabase.storage.from_("audios-convertidos").remove([file_path_in_bucket])
        
        # La respuesta de .remove() a veces puede ser una lista vacía o un objeto,
        # verificar si hubo un error. Si no hay excepción, asumimos éxito.
        app.logger.info(f"Archivo eliminado de Storage: {file_path_in_bucket}")

        # 3. Eliminar el registro de la base de datos
        response_delete_db = supabase.table("audios_convertidos").delete().eq("id", audio_id).execute()

        if response_delete_db.data:
            return jsonify({"message": "Audio eliminado exitosamente."}), 200
        else:
            # Si el registro no se encontró o no se pudo eliminar, a pesar de que el archivo del storage sí
            return jsonify({"error": "Audio eliminado del Storage, pero no se pudo eliminar el registro de la DB o no fue encontrado."}), 404

    except Exception as e:
        app.logger.error(f"Error al eliminar audio: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({"error": f"Error interno al eliminar el audio. Detalles: {str(e)}"}), 500

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
    
    # Rutas para archivos temporales
    temp_input_path = f"/tmp/{uuid.uuid4().hex}_input.{file.filename.split('.')[-1] if '.' in file.filename else 'tmp'}"
    file.save(temp_input_path)
    
    temp_original_wav_path = f"/tmp/{uuid.uuid4().hex}_original.wav"
    temp_processed_wav_path = f"/tmp/{uuid.uuid4().hex}_processed.wav"

    try:
        # 1. Convertir el archivo de entrada (MP3, WebM, etc.) a un WAV original estándar con FFmpeg
        # Esto asegura una entrada limpia para el resto del procesamiento.
        command_to_original_wav = [
            'ffmpeg',
            '-i', temp_input_path,
            '-acodec', 'pcm_f32le', # PCM Float 32-bit para alta calidad
            '-ar', '44100',        # Sample rate inicial, ajustado para ser fijo aquí
            '-ac', '1',            # Forzar a mono
            '-y',
            temp_original_wav_path
        ]
        subprocess.run(command_to_original_wav, check=True, capture_output=True)

        # Cargar el WAV original con soundfile para obtener sus datos para el espectro original
        y_original_audio_data, sr_original_audio_data = sf.read(temp_original_wav_path)
        spectrum_original = get_spectrum_data(y_original_audio_data, sr_original_audio_data)

        # 2. Preparar el comando FFmpeg para el procesamiento (remuestreo y cuantización)
        command_process = [
            'ffmpeg',
            '-i', temp_original_wav_path, # Usar el WAV original como entrada
        ]

        # Aplicar Tasa de Muestreo con FFmpeg
        if target_sample_rate_int:
            command_process.extend(['-ar', str(target_sample_rate_int)])
            sr_processed_final = target_sample_rate_int
        else:
            sr_processed_final = sr_original_audio_data # Si no se especifica, se mantiene el del original WAV
        
        # Aplicar Profundidad de Bits (Cuantización) con FFmpeg
        if target_bit_depth_int == 8:
            # CAMBIO: Usar 'pcm_u8' para WAV de 8 bits, que es lo más común y compatible
            command_process.extend(['-acodec', 'pcm_u8']) # <-- ¡CAMBIO AQUÍ!
        elif target_bit_depth_int == 16:
            command_process.extend(['-acodec', 'pcm_s16le'])
        elif target_bit_depth_int == 24:
            command_process.extend(['-acodec', 'pcm_s24le'])
        else: # Default a float 32-bit si 'Original' o no especificado
            command_process.extend(['-acodec', 'pcm_f32le']) 

        command_process.extend([
            '-ac', '1', # Forzar mono
            '-y',
            temp_processed_wav_path # Archivo WAV de salida procesado
        ])
        
        subprocess.run(command_process, check=True, capture_output=True)

        # Cargar el WAV procesado con soundfile para generar el espectro procesado
        y_processed_audio_data, sr_processed_audio_data = sf.read(temp_processed_wav_path)
        # Asegurarse de que sr_processed_final refleja lo que ffmpeg realmente usó al final
        if sr_processed_audio_data != sr_processed_final:
             sr_processed_final = sr_processed_audio_data

        spectrum_processed = get_spectrum_data(y_processed_audio_data, sr_processed_audio_data)

        # --- Subir el WAV procesado a Supabase Storage ---
        with open(temp_processed_wav_path, "rb") as f:
            audio_data_to_upload_wav = f.read()

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
            "frecuencia_muestreo": sr_processed_final,
            "profundidad_de_bits": target_bit_depth_int,
            "url_audio_procesado": public_audio_url_wav,
            "espectro_original": spectrum_original,
            "espectro_modificado": spectrum_processed,
        }

        response_insert = supabase.table("audios_convertidos").insert(data_to_insert).execute()

        if response_insert.data:
            # Para la previsualización en el frontend, se lee el WAV procesado a base64
            with open(temp_processed_wav_path, "rb") as f_preview:
                audio_base64_wav = base64.b64encode(f_preview.read()).decode('utf-8')

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
    
    except subprocess.CalledProcessError as e:
        app.logger.error(f"FFmpeg conversion error: {e.stderr.decode()}")
        return jsonify({"error": f"Error en el procesamiento de audio con FFmpeg. Detalles: {e.stderr.decode()}"}), 500
    except Exception as e:
        app.logger.error(f"Error general al procesar el audio: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({"error": f"Error interno al procesar el audio. Detalles: {str(e)}"}), 500
    finally:
        # Asegurarse de limpiar todos los archivos temporales
        for temp_file in [temp_input_path, temp_original_wav_path, temp_processed_wav_path]:
            if os.path.exists(temp_file):
                os.remove(temp_file)

@app.route('/api/download_audio', methods=['GET'])
def download_audio():
    audio_url = request.args.get('audio_url')
    download_format = request.args.get('format', 'wav').lower()
    
    if not audio_url:
        return jsonify({"error": "URL del audio no proporcionada"}), 400
    
    if not audio_url.startswith(f"{SUPABASE_URL}/storage/v1/object/public/audios-convertidos/"):
        return jsonify({"error": "URL de audio inválida o no permitida"}), 400

    temp_downloaded_wav_path = None
    output_converted_path = None

    try:
        path_in_bucket = audio_url.split(f"{SUPABASE_URL}/storage/v1/object/public/audios-convertidos/")[1]
        
        response_download = supabase.storage.from_("audios-convertidos").download(path_in_bucket)
        
        if not response_download:
            return jsonify({"error": "No se pudo descargar el archivo de Supabase Storage."}), 500
        
        # Guardar el WAV descargado temporalmente
        temp_downloaded_wav_path = f"/tmp/{uuid.uuid4().hex}_downloaded.wav"
        with open(temp_downloaded_wav_path, "wb") as f:
            f.write(response_download)
        
        output_buffer = io.BytesIO()
        filename_base = os.path.splitext(os.path.basename(path_in_bucket))[0]
        
        if download_format == 'mp3':
            output_converted_path = f"/tmp/{uuid.uuid4().hex}_output.mp3"
            
            command = [
                'ffmpeg',
                '-i', temp_downloaded_wav_path, # Entrada: el WAV descargado
                '-b:a', '192k',
                '-y', output_converted_path
            ]
            
            subprocess.run(command, check=True, capture_output=True)

            with open(output_converted_path, "rb") as f:
                output_buffer = io.BytesIO(f.read())
            
            mimetype = "audio/mpeg"
            filename = f"{filename_base}.mp3"

        elif download_format == 'wav':
            # Si se pide WAV, simplemente leemos el WAV descargado y lo enviamos
            with open(temp_downloaded_wav_path, "rb") as f:
                output_buffer = io.BytesIO(f.read())
            
            mimetype = "audio/wav"
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

    except subprocess.CalledProcessError as e:
        app.logger.error(f"FFmpeg conversion error during download: {e.stderr.decode()}")
        return jsonify({"error": f"Error en la conversión de descarga con FFmpeg. Detalles: {e.stderr.decode()}"}), 500
    except Exception as e:
        app.logger.error(f"Error al procesar la descarga de audio: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({"error": f"Error interno al descargar el audio. Detalles: {str(e)}"}), 500
    finally:
        # Limpiar archivos temporales en la descarga
        for temp_file in [temp_downloaded_wav_path, output_converted_path]:
            if temp_file and os.path.exists(temp_file):
                os.remove(temp_file)

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