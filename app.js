const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const bcrypt = require('bcrypt');
const app = express();
const PORT = 8080;

// Configurar conexión a MySQL
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '', 
    database: 'clientes',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middlewares
app.use(express.static('public'));
app.use(express.json());
app.use(session({ // <-- Configurar sesiones
  secret: 'mi_secreto_super_seguro',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Cambiar a true si usas HTTPS
}));



// Ruta de inicio
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/usuario.html');
});

//////////////////////////

// Ruta de login
app.post('/login', async (req, res) => {
  const { correo, password } = req.body;

  try {
      const [rows] = await pool.promise().query(
          'SELECT * FROM cliente WHERE correo = ?',
          [correo]
      );

      if (rows.length === 0) {
          return res.status(401).json({ error: 'Correo no registrado' });
      }

      const usuario = rows[0];
      
      // Comparar contraseña con hash
      const match = await bcrypt.compare(password, usuario.password);
      
      if (!match) {
          return res.status(401).json({ error: 'Contraseña incorrecta' });
      }

      req.session.userId = usuario.id;
      res.json({ success: true });

  } catch (error) {
      console.error('Error en login:', error);
      res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Ruta de logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
})



//////////////////////////

// Ruta para registro
app.post('/registrar', async (req, res) => {
    const { correo, password } = req.body;
    
    try {

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.promise().query(
            'INSERT INTO cliente (correo, password) VALUES (?, ?)',
            [correo, hashedPassword]
        );
        
        res.status(201).json({
            id: result.insertId,
            correo,
            message: 'Usuario registrado exitosamente'
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ error: 'El correo ya está registrado' });
        } else {
            console.error('Error en registro:', error);
            res.status(500).json({ error: 'Error en el servidor' });
        }
    }
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});