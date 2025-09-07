from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import json
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

# Хранение информации о комнатах и пользователях
rooms = {}
users = {}

@app.route('/')
def index():
    return render_template('main.html')

@app.route('/room/<room_id>')
def room(room_id):
    return render_template('index.html', room_id=room_id)

@socketio.on('join')
def on_join(data):
    room = data['room']
    user_profile = data.get('profile', {'name': 'Гость', 'avatar': '😊'})
    
    join_room(room)
    
    # Сохраняем информацию о пользователе
    users[request.sid] = {
        'room': room,
        'profile': user_profile,
        'connected_at': datetime.now(),
        'speaking': False,
        'mic_enabled': True,
        'camera_enabled': False,
        'screen_sharing': False
    }
    
    # Обновляем информацию о комнате
    if room not in rooms:
        rooms[room] = {'users': [], 'created_at': datetime.now()}
    
    rooms[room]['users'].append({
        'sid': request.sid,
        'profile': user_profile
    })
    
        # Уведомляем всех о новом участнике
    emit('user_joined', {
        'user_id': request.sid,
        'profile': user_profile,
        'participants_count': len(rooms[room]['users'])
    }, to=room)
    
    # Отправляем текущий список участников новому пользователю
    emit('participants_update', {
        'participants': [u['profile'] for u in rooms[room]['users']],
        'count': len(rooms[room]['users'])
    })
    
    print(f"Пользователь {user_profile['name']} {user_profile['avatar']} присоединился к комнате {room}")

@socketio.on('speaking_status')
def handle_speaking_status(data):
    room = data['room']
    speaking = data['speaking']
    user_profile = data['profile']
    
    # Обновляем статус пользователя
    if request.sid in users:
        users[request.sid]['speaking'] = speaking
    
    # Уведомляем всех остальных в комнате
    emit('speaking_status', {
        'profile': user_profile,
        'speaking': speaking,
        'user_id': request.sid
    }, to=room, include_self=False)
    
    status_text = "говорит" if speaking else "молчит"
    print(f"Пользователь {user_profile['name']} {user_profile['avatar']} {status_text}")

@socketio.on('camera_status')
def handle_camera_status(data):
    room = data['room']
    enabled = data['enabled']
    user_profile = data['profile']
    
    # Обновляем статус пользователя
    if request.sid in users:
        users[request.sid]['camera_enabled'] = enabled
    
    # Уведомляем всех в комнате
    emit('camera_status', {
        'profile': user_profile,
        'enabled': enabled,
        'user_id': request.sid
    }, to=room)
    
    status_text = "включил" if enabled else "выключил"
    print(f"Пользователь {user_profile['name']} {user_profile['avatar']} {status_text} камеру")

@socketio.on('screen_status')
def handle_screen_status(data):
    room = data['room']
    enabled = data['enabled']
    user_profile = data['profile']
    
    # Обновляем статус пользователя
    if request.sid in users:
        users[request.sid]['screen_sharing'] = enabled
    
    # Уведомляем всех в комнате
    emit('screen_status', {
        'profile': user_profile,
        'enabled': enabled,
        'user_id': request.sid
    }, to=room)
    
    status_text = "начал" if enabled else "завершил"
    print(f"Пользователь {user_profile['name']} {user_profile['avatar']} {status_text} демонстрацию экрана")

@socketio.on('mic_status')
def handle_mic_status(data):
    room = data['room']
    enabled = data['enabled']
    user_profile = data['profile']
    
    # Обновляем статус пользователя
    if request.sid in users:
        users[request.sid]['mic_enabled'] = enabled
    
    # Уведомляем всех в комнате
    emit('mic_status', {
        'profile': user_profile,
        'enabled': enabled,
        'user_id': request.sid
    }, to=room)
    
    status_text = "включил" if enabled else "выключил"
    print(f"Пользователь {user_profile['name']} {user_profile['avatar']} {status_text} микрофон")

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
    emit('video_status', data, to=data['room'])

@socketio.on('toggle_screen')
def toggle_screen(data):
    emit('screen_status', data, to=data['room'])

@socketio.on('toggle_audio')
def toggle_audio(data):
    emit('audio_status', data, to=data['room'])

@socketio.on('message')
def handle_message(data):
    room = data['room']
    
    # Получаем профиль отправителя
    sender_profile = users.get(request.sid, {}).get('profile', {'name': 'Гость', 'avatar': '😊'})
    
    # Формируем полное сообщение
    message_data = {
        'msg': data['msg'],
        'author': data.get('author', sender_profile['name']),
        'avatar': data.get('avatar', sender_profile['avatar']),
        'timestamp': data.get('timestamp', datetime.now().strftime('%H:%M')),
        'sender_id': request.sid
    }
    
    # Отправляем всем в комнате
    emit('message', message_data, to=room)
    print(f"Сообщение от {message_data['author']} {message_data['avatar']}: {message_data['msg']}")

@socketio.on('reaction')
def handle_reaction(data):
    room = data['room']
    
    # Получаем профиль отправителя
    sender_profile = users.get(request.sid, {}).get('profile', {'name': 'Гость', 'avatar': '😊'})
    
    # Формируем данные реакции
    reaction_data = {
        'emoji': data['emoji'],
        'author': data.get('author', sender_profile['name']),
        'avatar': data.get('avatar', sender_profile['avatar']),
        'timestamp': data.get('timestamp', datetime.now().strftime('%H:%M')),
        'sender_id': request.sid
    }
    
    # Отправляем всем в комнате
    emit('reaction', reaction_data, to=room)
    print(f"Реакция от {reaction_data['author']} {reaction_data['avatar']}: {reaction_data['emoji']}")

@socketio.on('disconnect')
def handle_disconnect():
    if request.sid in users:
        user_info = users[request.sid]
        room = user_info['room']
        user_profile = user_info['profile']
        
        # Удаляем пользователя из комнаты
        if room in rooms:
            rooms[room]['users'] = [u for u in rooms[room]['users'] if u['sid'] != request.sid]
            
            # Уведомляем оставшихся участников
            emit('user_left', {
                'user_id': request.sid,
                'profile': user_profile,
                'participants_count': len(rooms[room]['users'])
            }, to=room)
            
            # Удаляем комнату, если она пустая
            if len(rooms[room]['users']) == 0:
                del rooms[room]
        
        # Удаляем пользователя
        del users[request.sid]
        print(f"Пользователь {user_profile['name']} {user_profile['avatar']} покинул комнату {room}")

if __name__ == '__main__':
    socketio.run(app, debug=True)