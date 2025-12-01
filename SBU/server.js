const express = require('express'); 
const mysql = require('mysql2');     

const app = express();               
const port = 3000;                  


app.use(express.urlencoded({ extended: true }));

// Configuração das pastas (Rotas estáticas)
app.use('/aluno', express.static('Aluno'));
app.use('/biblio', express.static('Bibliotecario'));
app.use('/totem', express.static('Totem'));
app.use('/public', express.static('public'));            

// Conexão com Banco
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'SENHA BANCO DE DADOS',      
    database: 'biblioteca_puc'
});

// Rota da Banca
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/banca.html');
});

// --- ROTA DE CADASTRAR ALUNO ---
app.post('/cadastrar', (req, res) => {
    console.log('Recebi dados do formulário:');
    const nome = req.body.nome;
    const ra = req.body.ra;
    console.log('Nome:', nome, 'RA:', ra);
    
    const sql = "INSERT INTO Alunos (nome, ra) VALUES (?, ?)";

    db.query(sql, [nome, ra], (err, result) => {
        if (err) {
            console.error('Erro ao cadastrar no banco:', err);
            res.send('Ocorreu um erro ao tentar cadastrar. Tente novamente.');
            return;
        }
        console.log('Aluno cadastrado com sucesso!');
        res.send('<h1>Cadastro realizado com sucesso!</h1> <a href="/">Voltar</a>');
    });
});

// --- ROTA DE CADASTRAR LIVRO ---
app.post('/cadastrar-livro', (req, res) => {
    console.log('Recebi dados do formulário [LIVRO]:');

    const titulo = req.body.titulo;
    const codigo_livro = req.body.codigo_livro;
    const genero = req.body.genero;
    const autor = req.body.autor;
    const editora = req.body.editora;
    const quantidade_total = req.body.quantidade_total;
    const quantidade_disponivel = quantidade_total; 

    const sql = `
        INSERT INTO Livros 
        (codigo_livro, titulo, autor, genero, editora, quantidade_total, quantidade_disponivel) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [codigo_livro, titulo, autor, genero, editora, quantidade_total, quantidade_disponivel], (err, result) => {
        if (err) {
            console.error('Erro ao cadastrar livro:', err);
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).send('<h1>Erro: Este Código de Livro já está cadastrado.</h1> <a href="/biblio/cadastro.html">Voltar</a>');
            }
            res.status(500).send('Ocorreu um erro. <a href="/biblio/cadastro.html">Voltar</a>');
            return;
        }
        console.log('Livro cadastrado com sucesso!');
        res.send('<h1>Livro cadastrado com sucesso!</h1> <a href="/biblio/cadastro.html">Voltar</a>');
    });
});


app.post('/aluno-verificar', (req, res) => {
    const codigo = req.body.livro;

    const sql = "SELECT titulo, quantidade_disponivel FROM Livros WHERE codigo_livro = ?";

    db.query(sql, [codigo], (err, results) => {
        if (err) return res.send('Erro no banco.');

        
        if (results.length === 0) {
            return res.send(`
                <div style="text-align:center; padding:50px; font-family: sans-serif;">
                    <h1>Livro não encontrado </h1>
                    <p>O código <strong>${codigo}</strong> não existe.</p>
                    <a href="/aluno/consulta.html">Voltar</a>
                </div>
            `);
        }

        const livro = results[0];

        if (livro.quantidade_disponivel > 0) {
            res.send(`
                <div style="text-align:center; padding:50px; font-family: sans-serif; background-color: #d4edda; color: #155724;">
                    <h1>DISPONÍVEL! ✅</h1>
                    <h2>${livro.titulo}</h2>
                    <p>Temos ${livro.quantidade_disponivel} unidades.</p>
                    <a href="/aluno/consulta.html">Voltar</a>
                </div>
            `);
        } else {
            res.send(`
                <div style="text-align:center; padding:50px; font-family: sans-serif; background-color: #f8d7da; color: #721c24;">
                    <h1>INDISPONÍVEL ❌</h1>
                    <h2>${livro.titulo}</h2>
                    <p>Todos foram emprestados.</p>
                    <a href="/aluno/consulta.html">Voltar</a>
                </div>
            `);
        }
    });
});


// ROTA BIBLIOTECÁRIO
app.get('/biblio-listar-pendencias', (req, res) => {
    
    const sql = `
        SELECT 
            A.nome AS nome_aluno,
            A.ra AS ra_aluno,
            L.titulo AS nome_livro,
            L.codigo_livro,
            DATE_FORMAT(E.data_emprestimo, '%d/%m/%Y às %H:%i') AS data_saida
        FROM Emprestimos AS E
        JOIN Alunos AS A ON E.ra_aluno = A.ra
        JOIN Livros AS L ON E.codigo_livro = L.codigo_livro
        WHERE E.data_devolucao_real IS NULL
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ erro: 'Erro ao buscar dados' });
        }
       
        res.json(results);
    });
});

// --- ROTA DE EMPRÉSTIMO (TOTEM) ---
app.post('/totem-emprestar', (req, res) => {
    // Nota: No seu HTML, o input do RA chama "nome", então pegamos req.body.nome
    const ra_aluno = req.body.nome; 
    const codigo_livro = req.body.codigo;

    // 1. Primeiro verificamos se o livro tem estoque
    db.query("SELECT quantidade_disponivel FROM Livros WHERE codigo_livro = ?", [codigo_livro], (err, results) => {
        if (err) return res.send('Erro ao verificar estoque.');
        
        if (results.length === 0) {
            return res.send('<h1>Livro não encontrado!</h1><a href="/totem/emprestimo.html">Voltar</a>');
        }

        if (results[0].quantidade_disponivel <= 0) {
            return res.send('<h1>Estoque esgotado para este livro!</h1><a href="/totem/emprestimo.html">Voltar</a>');
        }

        // 2. Se tem estoque, realizamos o empréstimo (Inserir na tabela e Diminuir estoque)
        // Usamos DATE_ADD para dar 7 dias de prazo automaticamente
        const sqlEmprestimo = `
            INSERT INTO Emprestimos (ra_aluno, codigo_livro, data_devolucao_prevista) 
            VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))
        `;

        db.query(sqlEmprestimo, [ra_aluno, codigo_livro], (err2) => {
            if (err2) {
                console.error(err2);
                return res.send('<h1>Erro: Aluno não encontrado ou erro no sistema.</h1><a href="/totem/emprestimo.html">Voltar</a>');
            }

            // 3. Atualizar a quantidade do livro (Diminuir 1)
            db.query("UPDATE Livros SET quantidade_disponivel = quantidade_disponivel - 1 WHERE codigo_livro = ?", [codigo_livro]);

            res.send(`
                <div style="text-align:center; font-family:sans-serif; padding:50px;">
                    <h1>Empréstimo Realizado! ✅</h1>
                    <p>Aluno: ${ra_aluno} | Livro: ${codigo_livro}</p>
                    <p>Boa leitura!</p>
                    <a href="/totem/emprestimo.html">Voltar</a>
                </div>
            `);
        });
    });
});

// --- ROTA DE DEVOLUÇÃO (TOTEM) ---
app.post('/totem-devolver', (req, res) => {
    const ra_aluno = req.body.nome; // Lembra que no HTML o name é "nome"
    const codigo_livro = req.body.codigo;

    // 1. Verificar se existe um empréstimo ABERTO (data_devolucao_real IS NULL)
    const checkSql = `
        SELECT id_emprestimo FROM Emprestimos 
        WHERE ra_aluno = ? AND codigo_livro = ? AND data_devolucao_real IS NULL
    `;

    db.query(checkSql, [ra_aluno, codigo_livro], (err, results) => {
        if (err) return res.send('Erro no sistema.');
        if (results.length === 0) {
            return res.send('<h1>Nenhum empréstimo ativo encontrado para este RA e Livro.</h1><a href="/totem/devolucao.html">Voltar</a>');
        }

        // 2. Atualizar o empréstimo (Marcar como devolvido hoje)
        const updateEmp = "UPDATE Emprestimos SET data_devolucao_real = NOW(), status = 'Devolvido' WHERE id_emprestimo = ?";
        db.query(updateEmp, [results[0].id_emprestimo]);

        // 3. Devolver estoque do livro (+1)
        const updateLivro = "UPDATE Livros SET quantidade_disponivel = quantidade_disponivel + 1 WHERE codigo_livro = ?";
        db.query(updateLivro, [codigo_livro]);

        // 4. Dar pontos para o aluno (+10 pontos)
        const updatePontos = "UPDATE Alunos SET pontos = pontos + 10 WHERE ra = ?";
        db.query(updatePontos, [ra_aluno], (err) => {
            if (err) console.log("Erro ao dar pontos");
            
            res.send(`
                <div style="text-align:center; font-family:sans-serif; padding:50px; background-color:#e8f5e9;">
                    <h1>Devolução Confirmada! 📚</h1>
                    <h2>Você ganhou +10 pontos! 🌟</h2>
                    <a href="/totem/devolucao.html">Voltar</a>
                </div>
            `);
        });
    });
});

// --- ROTA DE VERIFICAR PONTOS ---
app.post('/verificar-pontos', (req, res) => {
    const ra_aluno = req.body.nome;

    const sql = "SELECT nome, pontos FROM Alunos WHERE ra = ?";

    db.query(sql, [ra_aluno], (err, results) => {
        if (err) return res.send('Erro ao buscar pontos.');
        
        if (results.length === 0) {
            return res.send('<h1>RA não encontrado.</h1><a href="/aluno/pontuacao.html">Voltar</a>');
        }

        const aluno = results[0];
        
        // Lógica simples de nível
        let nivel = "Leitor Iniciante 🥉";
        if (aluno.pontos > 50) nivel = "Leitor Prata 🥈";
        if (aluno.pontos > 100) nivel = "Leitor Ouro 🥇";

        res.send(`
            <div style="text-align:center; font-family:sans-serif; padding:50px; background-color:#fff3cd;">
                <h1>Olá, ${aluno.nome}!</h1>
                <h2>Sua Pontuação: <strong>${aluno.pontos}</strong></h2>
                <h3>Nível: ${nivel}</h3>
                <br>
                <a href="/aluno/pontuacao.html">Voltar</a>
            </div>
        `);
    });
});

// INICIANDO O SERVIDOR
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
    console.log('Acesse http://localhost:3000 no seu navegador.');
});
