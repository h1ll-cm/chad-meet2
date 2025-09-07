from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'  # Для безопасности SocketIO
socketio = SocketIO(app)

# ДОБАВЛЯЕМ НОВЫЙ ROUTE ДЛЯ ГЛАВНОЙ СТРАНИЦЫ
@app.route('/')
def index():
    return render_template('main.html')  # Назовем главную страницу main.html

@app.route('/room/<room_id>')
def room(room_id):
    return render_template('index.html', room_id=room_id)

@socketio.on('join')
def on_join(data):
    room = data['room']
    join_room(room)
    emit('user_joined', {'user_id': request.sid}, to=room)

@socketio.on('offer')
def handle_offer(data):
    emit('offer', data, to=data['to'])

@socketio.on('answer')
def handle_answer(data):
    emit('answer', data, to=data['to'])

@socketio.on('ice-candidate')
def handle_ice_candidate(data):
    emit('ice-candidate', data, to=data['to'])

@socketio.on('toggle_video')
def toggle_video(data):
    emit('video_status', data, to=data['room'])  # Уведомляем всех в комнате, включая себя для синхрона

@socketio.on('toggle_screen')
def toggle_screen(data):
    emit('screen_status', data, to=data['room'])

@socketio.on('toggle_audio')
def toggle_audio(data):
    emit('audio_status', data, to=data['room'])

@socketio.on('message')
def handle_message(data):
    emit('message', data['msg'], to=data['room'])

if __name__ == '__main__':
    socketio.run(app, debug=True)