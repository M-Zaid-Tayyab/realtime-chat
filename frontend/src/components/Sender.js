import React, { useEffect, useState } from 'react';
import axios from 'axios';
import io from 'socket.io-client';

const socket = io('http://localhost:3001'); // Node server

const Sender = () => {
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');

    const currentUser = 9;
    const receiverId = 156
    const token = '8|94ZKTv7qxLPYlWqCDuZtJPGgZO3taPvlBErxBie87efbd45f'; // currentUser token 

    useEffect(() => {
        socket.emit('join', { userId: currentUser });
    }, [currentUser]);


    useEffect(() => {
        const loadMessages = async () => {
            const res = await axios.get(`http://localhost:8000/api/messages/history?user_id=${receiverId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                },
            });
            setMessages(res.data.data.data);
        };

        loadMessages();
    }, [receiverId, token]);


    useEffect(() => {
        const handleNewMessage = (msg) => {
            console.log('Socket received:', msg);
            setMessages((prev) => [...prev, msg]);
        };

        socket.on('receive_message', handleNewMessage);

        return () => {
            socket.off('receive_message', handleNewMessage);
        };
    }, []);

   
    const sendMessage = async () => {
        const msg = {
            sender_id: currentUser,
            receiver_id: receiverId,
            message: text,
        };

        const formData = new FormData();
        for (const key in msg) {
            formData.append(key, msg[key]);
        }

        await axios.post('http://localhost:8000/api/messages/send', formData, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
        });

        setMessages((prev) => [...prev, msg]);
        setText('');
    };

    return (
        <div style={{ padding: 20 }}>
            <h2>Chat: #{currentUser} → #{receiverId}</h2>
            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #ccc', padding: 10 }}>
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        style={{
                            margin: '10px 0',
                            textAlign: msg.sender_id === currentUser ? 'right' : 'left',
                        }}
                    >
                        <div style={{ display: 'inline-block', background: '#f0f0f0', padding: '8px 12px', borderRadius: 12 }}>
                            {msg.message}
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: 10 }}>
                <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type message..."
                    style={{ width: '70%', padding: 8 }}
                />
                <button onClick={sendMessage} style={{ padding: 8, marginLeft: 8 }}>
                    Send
                </button>
            </div>
        </div>
    );
};

export default Sender;
