from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import io
import numpy as np
import base64
import traceback
from dotenv import load_dotenv
from supabase import create_client, Client
import uuid
import soundfile as sf
import subprocess

#Carga las variables de entorno desde el archivo backend/.env
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

app = Flask(__name__)

#Configuracion de CORS para permitir solicitudes desde el frontend
FRONTEND_URL = os.environ.get('FRONTEND_URL')
if FRONTEND_URL:
    CORS(app, resources={r"/api/*": {"origins": [FRONTEND_URL]}})
else:
    CORS(app)

#Inicializa el cliente de Supabase con las URL y claves de servicio
SUPABASE_URL: str = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY: str = os.environ.get('SUPABASE_SERVICE_KEY')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

#Calcula el espectro de frecuencia de una señal de audio
def get_spectrum_data(y, sr, max_points=512):
    #Argumentos:
    #y: Datos de la señal de audio
    #sr: Tasa de muestreo de la señal de audio
    #max_points: Numero maximo de puntos para el espectro. Reduce la resolucion si la señal es muy larga

    if len(y) == 0:
        return {"frequencies": [], "magnitudes": []}
    
    y_np = np.array(y)
    
    #Realiza la Transformada Rapida de Fourier (FFT) para obtener el espectro
    fft_result = np.fft.rfft(y_np)
    #Calcula las frecuencias correspondientes a los resultados de la FFT
    frequencies = np.fft.rfftfreq(len(y_np), d=1./sr)
    #Calcula las magnitudes (amplitud) de las componentes de frecuencia
    magnitudes = np.abs(fft_result)

    # Si hay demasiados puntos, reduce la resolución para evitar graficos muy densos
    if len(frequencies) > max_points:
        step = len(frequencies) // max_points
        frequencies = frequencies[::step]
        magnitudes = magnitudes[::step]

    #Return:
    #dict: Un diccionario con las listas de frecuencias y magnitudes
    return {"frequencies": frequencies.tolist(), "magnitudes": magnitudes.tolist()}

#Endpoint para verificar el estado de salud de la aplicacion. Retorna un JSON con el estado "ok"
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok"}), 200

#Elimina un archivo de audio del almacenamiento de Supabase y su registro asociado en la base de datos
@app.route('/api/delete_audio/<string:audio_id>', methods=['DELETE'])
def delete_audio(audio_id):
    #Args:
    #audio_id: El ID unico del audio a eliminar

    try:
        #Busca la URL del audio en la base de datos
        response_select = supabase.table("audios_convertidos").select("url_audio_procesado").eq("id", audio_id).single().execute()
        
        if not response_select.data:
            return jsonify({"error": "Audio no encontrado en la base de datos."}), 404
        
        audio_url_to_delete = response_select.data.get("url_audio_procesado")
        
        if not audio_url_to_delete:
            return jsonify({"error": "URL de audio no encontrada para el registro."}), 500

        #Extrae la ruta del archivo dentro del bucket de Supabase Storage
        path_segments = audio_url_to_delete.split('/')
        if 'audios-convertidos' not in path_segments:
            return jsonify({"error": "URL de Storage inválida."}), 400
        
        try:
            bucket_index = path_segments.index('audios-convertidos')
            object_public_index = path_segments.index('public', bucket_index + 1)
            file_path_in_bucket = '/'.join(path_segments[object_public_index:])
        except ValueError:
            return jsonify({"error": "Formato de URL de Storage no reconocido."}), 400

        #Elimina el archivo del bucket de Supabase Storage
        supabase.storage.from_("audios-convertidos").remove([file_path_in_bucket])
        
        app.logger.info(f"Archivo eliminado de Storage: {file_path_in_bucket}")

        #Elimina el registro de la base de datos
        response_delete_db = supabase.table("audios_convertidos").delete().eq("id", audio_id).execute()

        if response_delete_db.data:
            return jsonify({"message": "Audio eliminado exitosamente."}), 200
        else:
            return jsonify({"error": "Audio eliminado del Storage, pero no se pudo eliminar el registro de la DB o no fue encontrado."}), 404

    except Exception as e:
        app.logger.error(f"Error al eliminar audio: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({"error": f"Error interno al eliminar el audio. Detalles: {str(e)}"}), 500

#Recibe un archivo de audio, lo procesa (cambiando la tasa de muestreo y profundidad de bits si se especifica),
#calcula su espectro, sube el audio procesado a Supabase Storage y guarda los metadatos en la base de datos
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
    
    #Rutas temporales para el procesamiento de archivos
    temp_input_path = f"/tmp/{uuid.uuid4().hex}_input.{file.filename.split('.')[-1] if '.' in file.filename else 'tmp'}"
    file.save(temp_input_path)
    
    temp_original_wav_path = f"/tmp/{uuid.uuid4().hex}_original.wav"
    temp_processed_wav_path = f"/tmp/{uuid.uuid4().hex}_processed.wav"

    try:
        #Convierte el audio original a un formato WAV estándar (PCM de 32 bits flotantes, 44.1kHz, mono)
        command_to_original_wav = [
            'ffmpeg',
            '-i', temp_input_path,
            '-acodec', 'pcm_f32le',
            '-ar', '44100',
            '-ac', '1',
            '-y',
            temp_original_wav_path
        ]
        subprocess.run(command_to_original_wav, check=True, capture_output=True)

        #Lee el audio original para calcular su espectro
        y_original_audio_data, sr_original_audio_data = sf.read(temp_original_wav_path)
        spectrum_original = get_spectrum_data(y_original_audio_data, sr_original_audio_data)

        #Prepara el comando FFmpeg para procesar el audio según los parámetros de entrada
        command_process = [
            'ffmpeg',
            '-i', temp_original_wav_path,
        ]

        #Aplica la nueva tasa de muestreo si se especifico
        if target_sample_rate_int:
            command_process.extend(['-ar', str(target_sample_rate_int)])
            sr_processed_final = target_sample_rate_int
        else:
            sr_processed_final = sr_original_audio_data
        
        #Aplica la nueva profundidad de bits si se especifico
        if target_bit_depth_int == 8:
            command_process.extend(['-acodec', 'pcm_u8'])
        elif target_bit_depth_int == 16:
            command_process.extend(['-acodec', 'pcm_s16le'])
        elif target_bit_depth_int == 24:
            command_process.extend(['-acodec', 'pcm_s24le'])
        else:
            command_process.extend(['-acodec', 'pcm_f32le']) #Por defecto a 32-bit float

        command_process.extend([
            '-ac', '1', #Asegura que sea mono
            '-y', #Sobrescribe el archivo de salida si existe
            temp_processed_wav_path
        ])
        
        subprocess.run(command_process, check=True, capture_output=True)

        #Lee el audio procesado para calcular su espectro
        y_processed_audio_data, sr_processed_audio_data = sf.read(temp_processed_wav_path)
        if sr_processed_audio_data != sr_processed_final:
            sr_processed_final = sr_processed_audio_data

        spectrum_processed = get_spectrum_data(y_processed_audio_data, sr_processed_audio_data)

        #Lee el archivo WAV procesado para subirlo a Supabase Storage
        with open(temp_processed_wav_path, "rb") as f:
            audio_data_to_upload_wav = f.read()

        #Genera un nombre unico para el archivo en Supabase y sube el archivo
        supabase_file_name = f"{uuid.uuid4().hex}.wav"
        path_in_bucket = f"public/{supabase_file_name}"
        final_mimetype_for_supabase = "audio/wav"

        supabase.storage.from_("audios-convertidos").upload(
            file=audio_data_to_upload_wav,
            path=path_in_bucket,
            file_options={"content-type": final_mimetype_for_supabase}
        )

        public_audio_url_wav = f"{SUPABASE_URL}/storage/v1/object/public/audios-convertidos/{path_in_bucket}"
        
        app.logger.info(f"Archivo WAV procesado subido a Supabase Storage. URL: {public_audio_url_wav}")

        #Prepara los datos para insertar en la base de datos
        data_to_insert = {
            "nombre_archivo_original": nombre_archivo_original,
            "frecuencia_muestreo": sr_processed_final,
            "profundidad_de_bits": target_bit_depth_int,
            "url_audio_procesado": public_audio_url_wav,
            "espectro_original": spectrum_original,
            "espectro_modificado": spectrum_processed,
        }

        #Inserta los metadatos del audio en la base de datos de Supabase
        response_insert = supabase.table("audios_convertidos").insert(data_to_insert).execute()

        if response_insert.data:
            #Codifica el audio procesado a Base64 para enviarlo en la respuesta
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
        #Limpia los archivos temporales
        for temp_file in [temp_input_path, temp_original_wav_path, temp_processed_wav_path]:
            if os.path.exists(temp_file):
                os.remove(temp_file)

#Descarga un archivo de audio desde Supabase Storage y lo convierte al formato solicitado (WAV o MP3) antes de enviarlo como respuesta.
@app.route('/api/download_audio', methods=['GET'])
def download_audio():
    audio_url = request.args.get('audio_url')
    download_format = request.args.get('format', 'wav').lower() #Formato por defecto es WAV
    
    if not audio_url:
        return jsonify({"error": "URL del audio no proporcionada"}), 400
    
    #Valida que la URL provenga de tu bucket de Supabase
    if not audio_url.startswith(f"{SUPABASE_URL}/storage/v1/object/public/audios-convertidos/"):
        return jsonify({"error": "URL de audio inválida o no permitida"}), 400

    temp_downloaded_wav_path = None
    output_converted_path = None

    try:
        #Extrae la ruta del archivo dentro del bucket de Supabase Storage
        path_in_bucket = audio_url.split(f"{SUPABASE_URL}/storage/v1/object/public/audios-convertidos/")[1]
        
        #Descarga el archivo de Supabase Storage
        response_download = supabase.storage.from_("audios-convertidos").download(path_in_bucket)
        
        if not response_download:
            return jsonify({"error": "No se pudo descargar el archivo de Supabase Storage."}), 500
        
        #Guarda el archivo descargado temporalmente como WAV
        temp_downloaded_wav_path = f"/tmp/{uuid.uuid4().hex}_downloaded.wav"
        with open(temp_downloaded_wav_path, "wb") as f:
            f.write(response_download)
        
        #Prepara un buffer para la salida del archivo
        output_buffer = io.BytesIO()
        #Extrae el nombre base del archivo para el nombre de descarga
        filename_base = os.path.splitext(os.path.basename(path_in_bucket))[0]
        
        #Procesa y convierte el archivo según el formato solicitado
        if download_format == 'mp3':
            output_converted_path = f"/tmp/{uuid.uuid4().hex}_output.mp3"
            
            #Comando FFmpeg para convertir a MP3
            command = [
                'ffmpeg',
                '-i', temp_downloaded_wav_path,
                '-b:a', '192k', #Bitrate de 192kbps para MP3
                '-y', output_converted_path
            ]
            
            subprocess.run(command, check=True, capture_output=True)

            #Lee el archivo MP3 convertido y lo guarda en el buffer
            with open(output_converted_path, "rb") as f:
                output_buffer = io.BytesIO(f.read())
            
            mimetype = "audio/mpeg"
            filename = f"{filename_base}.mp3"

        elif download_format == 'wav':
            #Si el formato es WAV, simplemente lee el archivo descargado en el buffer
            with open(temp_downloaded_wav_path, "rb") as f:
                output_buffer = io.BytesIO(f.read())
            
            mimetype = "audio/wav"
            filename = f"{filename_base}.wav"
        else:
            return jsonify({"error": "Formato de descarga no soportado"}), 400
        
        output_buffer.seek(0) #Mueve el puntero al inicio del buffer

        #Envia el archivo al cliente
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
        #Limpia los archivos temporales
        for temp_file in [temp_downloaded_wav_path, output_converted_path]:
            if temp_file and os.path.exists(temp_file):
                os.remove(temp_file)

#Obtiene los últimos 5 audios convertidos de la base de datos de Supabase, ordenados por fecha de creación descendente.
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
            return jsonify([]), 200 #Retorna un array vacío si no hay audios

    except Exception as e:
        app.logger.error(f"Error al obtener la biblioteca de audios: {str(e)}")
        app.logger.error(traceback.format_exc())
        return jsonify({"error": f"Error interno al obtener la biblioteca de audios. Detalles: {str(e)}"}), 500

if __name__ == '__main__':
    #Inicia la aplicacion Flask en modo depuracion
    app.run(debug=True, host='0.0.0.0', port=5000)