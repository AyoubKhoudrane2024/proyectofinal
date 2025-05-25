// Explorador de archivos simple con Express
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 8080;
const BASE_DIR = path.join(__dirname, 'files');

// Base de datos
const pool = mysql.createPool({
  host: 'localhost', user: 'root', password: '', database: 'clientes'
});

// Sesiones y middlewares
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(express.json());
app.use(session({ secret: 'mi_secreto', resave: false, saveUninitialized: false }));

// Multer (subidas)
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dest = path.join(BASE_DIR, req.query.path || '');
    await fs.mkdir(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// Ruta principal
app.get('/', (req, res) => res.sendFile(__dirname + '/public/usuario.html'));

// Registro
app.post('/registrar', async (req, res) => {
  const { correo, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const [r] = await pool.promise().query('INSERT INTO cliente (correo, password) VALUES (?, ?)', [correo, hashed]);
    res.json({ id: r.insertId, correo });
  } catch (e) {
    res.status(400).json({ error: 'Correo ya registrado' });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { correo, password } = req.body;
  const [rows] = await pool.promise().query('SELECT * FROM cliente WHERE correo = ?', [correo]);
  if (!rows.length || !(await bcrypt.compare(password, rows[0].password))) return res.status(401).json({ error: 'Credenciales inválidas' });
  req.session.userId = rows[0].id;
  res.json({ success: true });
});

// Logout
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

// Listar archivos
app.get('/list', async (req, res) => {
  const dir = path.join(BASE_DIR, req.query.path || '');
  try {
    const contenido = await fs.readdir(dir, { withFileTypes: true });
    res.json(contenido.map(i => ({ name: i.name, type: i.isDirectory() ? 'directory' : 'file', path: (req.query.path || '') + '/' + i.name })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Subir archivos
app.post('/upload', upload.array('files'), (req, res) => res.json({ success: true }));

// Crear carpeta
app.post('/mkdir', async (req, res) => {
  const ruta = path.join(BASE_DIR, req.body.path || '', req.body.name);
  await fs.mkdir(ruta, { recursive: true });
  res.json({ success: true });
});

// Eliminar archivo o carpeta
app.delete('/delete', async (req, res) => {
  const ruta = path.join(BASE_DIR, req.body.path);
  await fs.rm(ruta, { recursive: true, force: true });
  res.json({ success: true });
});

// Copiar
app.post('/copy', async (req, res) => {
  const src = path.join(BASE_DIR, req.body.srcPath);
  const dest = path.join(BASE_DIR, req.body.destPath);
  await copiar(src, dest);
  res.json({ success: true });
});

async function copiar(src, dest) {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const files = await fs.readdir(src);
    for (const file of files) {
      await copiar(path.join(src, file), path.join(dest, file));
    }
  } else {
    await fs.copyFile(src, dest);
  }
}

// Renombrar
app.post('/rename', async (req, res) => {
  const oldPath = path.join(BASE_DIR, req.body.oldPath);
  const newPath = path.join(BASE_DIR, req.body.newPath);
  await fs.rename(oldPath, newPath);
  res.json({ success: true });
});

// Enviar por correo
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'ayoubkhoudrane.daw@gmail.com',
      pass: 'erneaoroqdtijkfv' // Asegúrate que esté sin espacios y que sea una contraseña de aplicación válida
    }
  });
  
  app.post('/send-file', upload.none(), async (req, res) => {
    const { emailDestinatario, message, filePath } = req.body;
    try {
      console.log('Enviando archivo desde:', filePath);
  
      // Verifica si el archivo existe
      const exists = await fs.stat(filePath).catch(() => null);
      if (!exists) {
        console.error('Archivo no encontrado:', filePath);
        return res.status(404).send('Archivo no encontrado');
      }
  
      const content = await fs.readFile(filePath);
  
      await transporter.sendMail({
        from: 'ayoubkhoudrane.daw@gmail.com',
        to: emailDestinatario,
        subject: 'Archivo compartido',
        text: message || 'Te envío este archivo',
        attachments: [
          {
            filename: path.basename(filePath),
            content
          }
        ]
      });
  
      res.send('Correo enviado');
    } catch (e) {
      console.error('Error al enviar correo:', e);
      res.status(500).send('Error al enviar el correo: ' + e.message);
    }
  });

app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
