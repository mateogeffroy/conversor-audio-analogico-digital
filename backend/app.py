from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from pydub import AudioSegment
import io
import librosa
import numpy as np
import base64
import traceback

#Configuracion del entorno
app = Flask(__name__)
FRONTEND_URL = os.environ.get('FRONTEND_URL')
if FRONTEND_URL:
    CORS(app, resources={r"/api/*": {"origins": [FRONTEND_URL]}})
else:
    CORS(app)

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

    export_format_req = request.form.get('export_format', 'wav').lower()
    target_sample_rate_str = request.form.get('sample_rate')
    target_bit_depth_str = request.form.get('bit_depth')

    if file:
        try:
            original_filename = file.filename
            temp_filename = "temp_input_audio_for_librosa"
            
            file_extension = os.path.splitext(original_filename)[1]
            if not file_extension and hasattr(file, 'mimetype') and 'webm' in file.mimetype:
                 file_extension = ".webm"
            elif not file_extension:
                 file_extension = ".tmp"
            
            temp_filename += file_extension
            
            file.save(temp_filename)

            y_original, sr_original = librosa.load(temp_filename, sr=None, mono=True) 
            spectrum_original = get_spectrum_data(y_original, sr_original)
            
            audio_pydub = AudioSegment.from_file(temp_filename)
            os.remove(temp_filename)

            processed_audio_pydub = audio_pydub
            
            if target_sample_rate_str:
                target_sample_rate_int = int(target_sample_rate_str)
                if processed_audio_pydub.frame_rate != target_sample_rate_int:
                    processed_audio_pydub = processed_audio_pydub.set_frame_rate(target_sample_rate_int)
            
            if target_bit_depth_str:
                target_bit_depth_int = int(target_bit_depth_str)
                target_sample_width_bytes = target_bit_depth_int // 8
                if target_sample_width_bytes in [1, 2, 3]:
                    if processed_audio_pydub.sample_width != target_sample_width_bytes:
                        processed_audio_pydub = processed_audio_pydub.set_sample_width(target_sample_width_bytes)

            processed_buffer = io.BytesIO()
            processed_audio_pydub.export(processed_buffer, format="wav")
            processed_buffer.seek(0)
            y_processed, sr_processed = librosa.load(processed_buffer, sr=None, mono=True)
            spectrum_processed = get_spectrum_data(y_processed, sr_processed)

            export_final_buffer = io.BytesIO()
            final_mimetype = ""
            final_download_filename = f"processed_{processed_audio_pydub.frame_rate // 1000}kHz_{processed_audio_pydub.sample_width * 8}bit.{export_format_req}"

            if export_format_req == "wav":
                processed_audio_pydub.export(export_final_buffer, format="wav")
                final_mimetype = "audio/wav"
            elif export_format_req == "mp3":
                processed_audio_pydub.export(export_final_buffer, format="mp3")
                final_mimetype = "audio/mpeg"
            
            export_final_buffer.seek(0)
            audio_base64 = base64.b64encode(export_final_buffer.read()).decode('utf-8')
            
            return jsonify({
                "message": "Audio procesado.",
                "original_spectrum": spectrum_original,
                "processed_spectrum": spectrum_processed,
                "processed_audio_base64": audio_base64,
                "processed_audio_mimetype": final_mimetype,
                "download_filename": final_download_filename
            }), 200

        except Exception as e:
            app.logger.error(f"Error al procesar el audio: {str(e)}")
            app.logger.error(traceback.format_exc())
            return jsonify({"error": f"Error interno al procesar el audio. Detalles: {str(e)}"}), 500
    
    return jsonify({"error": "Error desconocido al subir el archivo"}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)