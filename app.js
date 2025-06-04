// app.js
const express = require('express');
const sesion = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const analizadorCuerpo = require('body-parser');
const mysql = require('mysql2');
const nodemailer = require('nodemailer');
const archiver = require('archiver'); // para comprimir y descaragr carpetas

const aplicacion = express();
const PUERTO = 8080;
const DIR_BASE = path.join(__dirname, 'archivos');

// Configuración de la base de datos
const grupoConexiones = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'clientes'
});

// Middlewares y sesiones
aplicacion.use(express.static('public'));
aplicacion.use(analizadorCuerpo.json());
aplicacion.use(express.json());
aplicacion.use(sesion({ 
  secret: 'mi_secreto', 
  resave: false, 
  saveUninitialized: false 
}));

// Configuración para subida de archivos
const almacenamiento = multer.diskStorage({
  destination: async (solicitud, archivo, callback) => {
    const destino = path.join(DIR_BASE, solicitud.query.ruta || '');
    await fs.mkdir(destino, { recursive: true });
    callback(null, destino);
  },
  filename: (solicitud, archivo, callback) => callback(null, archivo.originalname)
});
const subida = multer({ storage: almacenamiento });

// Rutas principales
aplicacion.get('/', (solicitud, respuesta) => {
  respuesta.sendFile(__dirname + '/public/usuario.html');
});

// Registro de usuario
aplicacion.post('/registrar', async (solicitud, respuesta) => {
  const { correo, password } = solicitud.body;
  try {
    const hashContrasena = await bcrypt.hash(password, 10);
    const [resultado] = await grupoConexiones.promise().query(
      'INSERT INTO cliente (correo, password) VALUES (?, ?)', 
      [correo, hashContrasena]
    );
    respuesta.json({ id: resultado.insertId, correo });
  } catch (error) {
    respuesta.status(400).json({ error: 'Este correo ya está registrado' });
  }
});

// Inicio de sesión
aplicacion.post('/login', async (solicitud, respuesta) => {
  const { correo, password } = solicitud.body;
  const [filas] = await grupoConexiones.promise().query(
    'SELECT * FROM cliente WHERE correo = ?', 
    [correo]
  );
  
  if (!filas.length || !(await bcrypt.compare(password, filas[0].password))) {
    return respuesta.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  
  solicitud.session.idUsuario = filas[0].id;
  respuesta.json({ exito: true });
});

// Cierre de sesión
aplicacion.get('/logout', (solicitud, respuesta) => {
  solicitud.session.destroy();
  respuesta.redirect('/');
});

// Listar contenido de directorio
aplicacion.get('/listar', async (solicitud, respuesta) => {
  const directorio = path.join(DIR_BASE, solicitud.query.ruta || '');
  try {
    const elementos = await fs.readdir(directorio, { withFileTypes: true });
    respuesta.json(elementos.map(item => ({
      nombre: item.name,
      tipo: item.isDirectory() ? 'directorio' : 'archivo',
      ruta: (solicitud.query.ruta || '') + '/' + item.name
    })));
  } catch (error) {
    respuesta.status(500).json({ error: error.message });
  }
});

// Subir archivos
aplicacion.post('/subir', subida.array('archivos'), (solicitud, respuesta) => {
  respuesta.json({ exito: true });
});

// Crear nueva carpeta
aplicacion.post('/crear-carpeta', async (solicitud, respuesta) => {
  const rutaCompleta = path.join(DIR_BASE, solicitud.body.ruta || '', solicitud.body.nombre);
  await fs.mkdir(rutaCompleta, { recursive: true });
  respuesta.json({ exito: true });
});

// Eliminar archivo o carpeta
aplicacion.delete('/eliminar', async (solicitud, respuesta) => {
  const rutaEliminar = path.join(DIR_BASE, solicitud.body.ruta);
  await fs.rm(rutaEliminar, { recursive: true, force: true });
  respuesta.json({ exito: true });
});

// Copiar elementos
aplicacion.post('/copiar', async (solicitud, respuesta) => {
  const origen = path.join(DIR_BASE, solicitud.body.rutaOrigen);
  const destino = path.join(DIR_BASE, solicitud.body.rutaDestino);
  await copiarRecursivo(origen, destino);
  respuesta.json({ exito: true });
});



// Función auxiliar para copia recursiva
async function copiarRecursivo(origen, destino) {
  const estadisticas = await fs.stat(origen);
  if (estadisticas.isDirectory()) {
    await fs.mkdir(destino, { recursive: true });
    const archivos = await fs.readdir(origen);
    for (const archivo of archivos) {
      await copiarRecursivo(path.join(origen, archivo), path.join(destino, archivo));
    }
  } else {
    await fs.copyFile(origen, destino);
  }
}

// Renombrar archivo o carpeta
aplicacion.post('/renombrar', async (solicitud, respuesta) => {
  const rutaVieja = path.join(DIR_BASE, solicitud.body.rutaAntigua);
  const rutaNueva = path.join(DIR_BASE, solicitud.body.rutaNueva);
  await fs.rename(rutaVieja, rutaNueva);
  respuesta.json({ exito: true });
});

// Enviar por correo
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'ayoubkhoudrane.daw@gmail.com',
    pass: 'erneaoroqdtijkfv' 
  }
});

// Enviar archivo por correo
aplicacion.post('/enviar', express.json(), async (req, res) => {  
  const { correoDestinatario, mensaje, rutaArchivo } = req.body;
  
  try {
    // Construye la ruta absoluta al archivo
    const rutaAbsoluta = path.join(__dirname, rutaArchivo);

    // Verifica si el archivo existe
    try {
      await fs.access(rutaAbsoluta);
    } catch {
      console.error('Archivo no encontrado:', rutaAbsoluta);
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    // Configura el correo
    const mailOptions = {
      from: 'ayoubkhoudrane.daw@gmail.com',
      to: correoDestinatario,
      subject: 'Archivo compartido',
      text: mensaje || 'Te envío este archivo',
      attachments: [
        {
          filename: path.basename(rutaAbsoluta),
          path: rutaAbsoluta  
        }
      ]
    };

    // Envía el correo
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Correo enviado correctamente' });
    
  } catch (error) {
    console.error('Error al enviar correo:', error);
    res.status(500).json({ 
      error: 'Error al enviar el correo',
      details: error.message 
    });
  }
});

// Descargar archivos o directorios
aplicacion.get('/descargar', async (req, res) => {
    const ruta = path.join(__dirname, 'archivos', req.query.ruta);
    
    try {
        const stats = await fs.stat(ruta);
        
        if (stats.isDirectory()) {
            const zip = archiver('zip');
            res.attachment(`${path.basename(ruta)}.zip`);
            zip.pipe(res);
            zip.directory(ruta, false);
            zip.finalize();
        } else {
            res.download(ruta);
        }
    } catch {
        res.status(404).send('Archivo no encontrado');
    }
});

// Iniciar servidor
aplicacion.listen(PUERTO, () => {
  console.log(`Servidor funcionando en http://localhost:${PUERTO}`);
});