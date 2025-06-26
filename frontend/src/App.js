import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Receiver from './components/Receiver';
import Sender from './components/Sender';

function App() {
  return (
    <Router>
      <div className="App">
        <h1>Chat</h1>

        <Routes>
          <Route
            path="*"
            element={<Sender />}
          />
          <Route
            path="/receiver"
            element={<Receiver />}
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
