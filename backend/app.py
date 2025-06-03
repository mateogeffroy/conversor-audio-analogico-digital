#backend/app.py
from flask import Flask
from flask_cors import CORS

#Inicializar la aplicación Flask
app = Flask(__name__)

#Configurar CORS para permitir solicitudes desde cualquier origen.
CORS(app)

# Definir una ruta de prueba
@app.route('/api/hello', methods=['GET'])
def hello():
    return {"message": "Hola desde el Backend Flask!"}

# Correr la aplicación
if __name__ == '__main__':
#host='0.0.0.0' hace que el servidor sea accesible desde cualquier IP de tu red local
#debug=True reinicia el server solo cuando se ejecuta un cambio
#port=5000 ejecuta el backend en ese puerto
    app.run(debug=True, host='0.0.0.0', port=5000)