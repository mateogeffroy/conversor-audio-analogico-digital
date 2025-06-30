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
import soundfile as sf

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

app = Flask(__name__)

# Permitir múltiples orígenes (útil para desarrollo y producción)
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "").split(",")
CORS(app, resources={r"/api/*": {"origins": ALLOWED_ORIGINS}})

# Supabase
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def get_spectrum_data(y, sr, max_points=512):
    if len(y) == 0:
        return {"frequencies": [], "magnitudes": []}
    fft_result = np.fft.rfft(y)
    frequencies = np.fft.rfftfreq(len(y), d=1. / sr)
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
    target_sample_rate = int(request.form.get('sample_rate')) if request.form.get('sample_rate') else None
    target_bit_depth = int(request.form.get('bit_depth')) if request.form.get('bit_depth') else None

    nombre_archivo_original = file.filename
    ext = os.path.splitext(nombre_archivo_original)[1] or ".tmp"
    temp_filename = f"temp_input_{uuid.uuid4().hex}{ext}"
    file.save(temp_filename)

    try:
        audio = AudioSegment.from_file(temp_filename)
        buf_original = io.BytesIO()
        audio.export(buf_original, format="wav")
        buf_original.seek(0)
        y_orig, sr_orig = librosa.load(buf_original, sr=None, mono=True)
        spec_orig = get_spectrum_data(y_orig, sr_orig)

        processed = audio
        if target_sample_rate:
            processed = processed.set_frame_rate(target_sample_rate)
        if target_bit_depth:
            sample_width = 3 if target_bit_depth == 24 else target_bit_depth // 8
            processed = processed.set_sample_width(sample_width)

        buf_proc = io.BytesIO()
        processed.export(buf_proc, format="wav")
        buf_proc.seek(0)
        y_proc, sr_proc = sf.read(buf_proc)
        y_proc = librosa.to_mono(y_proc) if y_proc.ndim > 1 else y_proc
        spec_proc = get_spectrum_data(y_proc, sr_proc)

        out_buf = io.BytesIO()
        mimetype = "audio/wav" if export_format_req == "wav" else "audio/mpeg"
        filename_out = f"processed_{processed.frame_rate//1000}kHz_{processed.sample_width*8}bit.{export_format_req}"
        processed.export(out_buf, format=export_format_req)
        out_buf.seek(0)
        audio_bytes = out_buf.read()

        supabase_filename = f"{uuid.uuid4().hex}.{export_format_req}"
        path_in_bucket = f"public/{supabase_filename}"
        supabase.storage.from_("audios-convertidos").upload(
            file=audio_bytes,
            path=path_in_bucket,
            file_options={"content-type": mimetype}
        )

        audio_url = f"{SUPABASE_URL}/storage/v1/object/public/audios-convertidos/{path_in_bucket}"
        app.logger.info(f"Subido a Supabase: {audio_url}")

        data = {
            "nombre_archivo_original": nombre_archivo_original,
            "formato_exportacion": export_format_req,
            "frecuencia_muestreo": target_sample_rate,
            "profundidad_de_bits": target_bit_depth,
            "url_audio_procesado": audio_url,
            "espectro_original": spec_orig,
            "espectro_modificado": spec_proc,
        }
        result = supabase.table("audios_convertidos").insert(data).execute()

        if result.data:
            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            return jsonify({
                "message": "Audio procesado y almacenado exitosamente.",
                "original_spectrum": spec_orig,
                "processed_spectrum": spec_proc,
                "processed_audio_base64": audio_b64,
                "processed_audio_mimetype": mimetype,
                "download_filename": filename_out,
                "processed_audio_url_supabase": audio_url
            }), 200
        else:
            raise Exception("Error al guardar metadatos en Supabase")

    except Exception as e:
        app.logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(temp_filename):
            os.remove(temp_filename)

@app.route('/api/library', methods=['GET'])
def get_library():
    try:
        result = supabase.table("audios_convertidos").select("*").order("created_at", desc=True).limit(5).execute()
        return jsonify(result.data or []), 200
    except Exception as e:
        app.logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000)
