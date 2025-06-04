from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
from pydub import AudioSegment
import io

app = Flask(__name__)

FRONTEND_URL = os.environ.get('FRONTEND_URL')
if FRONTEND_URL:
    CORS(app, resources={r"/api/*": {"origins": FRONTEND_URL}})
else:
    CORS(app)

@app.route('/api/upload_audio', methods=['POST'])
def upload_audio():
    if 'audio_file' not in request.files:
        return jsonify({"error": "No se encontró el archivo de audio"}), 400

    file = request.files['audio_file']

    if file.filename == '':
        return jsonify({"error": "No se seleccionó ningún archivo"}), 400

    export_format = request.form.get('export_format', 'wav').lower()
    target_sample_rate_str = request.form.get('sample_rate')
    target_bit_depth_str = request.form.get('bit_depth')

    if file:
        try:
            original_filename = file.filename
            temp_filename = "temp_input_audio"
            file_extension = os.path.splitext(original_filename)[1]
            if not file_extension and file.mimetype == 'audio/wav':
                file_extension = ".wav"
            elif not file_extension and file.mimetype == 'audio/webm':
                file_extension = ".webm"

            temp_filename += file_extension if file_extension else ".tmp"

            file.save(temp_filename)
            audio = AudioSegment.from_file(temp_filename)
            os.remove(temp_filename)

            original_sample_rate_khz = audio.frame_rate // 1000
            original_bit_depth_bits = audio.sample_width * 8

            if target_sample_rate_str:
                try:
                    target_sample_rate_int = int(target_sample_rate_str)
                    if audio.frame_rate != target_sample_rate_int:
                        audio = audio.set_frame_rate(target_sample_rate_int)
                        app.logger.info(f"Audio remuestreado a {target_sample_rate_int} Hz")
                except ValueError:
                    app.logger.warning(f"Tasa de muestreo inválida: {target_sample_rate_str}")

            if target_bit_depth_str:
                try:
                    target_bit_depth_int = int(target_bit_depth_str)
                    target_sample_width_bytes = target_bit_depth_int // 8

                    if target_sample_width_bytes not in [1, 2, 3]:
                        raise ValueError("Profundidad de bits no soportada para la conversión directa (8, 16, 24 bits).")

                    if audio.sample_width != target_sample_width_bytes:
                        audio = audio.set_sample_width(target_sample_width_bytes)
                        app.logger.info(f"Profundidad de bits cambiada a {target_bit_depth_int} bits ({target_sample_width_bytes} bytes)")
                except ValueError as ve:
                    app.logger.warning(f"Profundidad de bits inválida o no soportada: {target_bit_depth_str}. Error: {ve}")

            final_sample_rate_khz = audio.frame_rate // 1000
            final_bit_depth_bits = audio.sample_width * 8

            file_out_buffer = io.BytesIO()
            mimetype = ""
            download_filename = f"processed_{final_sample_rate_khz}kHz_{final_bit_depth_bits}bit.{export_format}"

            if export_format == "wav":
                audio.export(file_out_buffer, format="wav")
                mimetype = "audio/wav"
            elif export_format == "mp3":
                audio.export(file_out_buffer, format="mp3")
                mimetype = "audio/mpeg"
            else:
                return jsonify({"error": "Formato de exportación no soportado. Use 'wav' o 'mp3'."}), 400

            file_out_buffer.seek(0)

            return send_file(
                file_out_buffer,
                mimetype=mimetype,
                as_attachment=True,
                download_name=download_filename
            )
        except Exception as e:
            app.logger.error(f"Error al procesar el audio: {str(e)}")
            return jsonify({"error": f"Error interno al procesar el audio. Detalles: {str(e)}"}), 500
    return jsonify({"error": "Error desconocido al subir el archivo"}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)