import express from 'express';
import cors from 'cors';
import path from 'path';
import pkg from 'yt-dlp-wrap';

const YTDlpWrap = pkg.default;

const app = express();

app.use(cors());
app.use(express.json());
app.use(
  '/downloads',
  express.static(path.resolve('.'))
);
const ytDlp = new YTDlpWrap(
  path.resolve('./yt-dlp.exe')
);

console.log('execPromise =', typeof ytDlp.execPromise);
console.log('exec =', typeof ytDlp.exec);
console.log('yt-dlp path =', path.resolve('./yt-dlp.exe'));

app.get('/', (req, res) => {
  res.send('YouTube server is running');
});

app.post('/youtube', async (req, res) => {
  const { url } = req.body;

  console.log('① URL受信');

  try {
    console.log('② getVideoInfo開始');

    const info = await ytDlp.getVideoInfo(url);

    console.log('③ getVideoInfo完了');

    res.json({
      title: info.title,
      duration: info.duration,
      thumbnail:
        info.thumbnail ||
        (info.thumbnails?.length
          ? info.thumbnails[info.thumbnails.length - 1].url
          : null),
    });

    console.log('④ res.json完了');

  } catch (err) {
    console.error('❌ エラー', err);

    res.status(500).json({
      error: err.message,
    });
  }
});

app.post('/youtube-download', async (req, res) => {
  const { url } = req.body;

  try {
    console.log('ダウンロード開始');

    await ytDlp.execPromise([
      url,
      '-f',
      'mp4',
      '-o',
      'downloaded.mp4',
    ]);

    console.log('ダウンロード完了');

    res.json({
      success: true,
      file: 'downloaded.mp4',
    });

  } catch (err) {
    console.error('❌ ダウンロードエラー');
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
});

app.get('/download-test', async (req, res) => {
  try {
    console.log('テスト開始');

    await ytDlp.execPromise([
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      '-f',
      'mp4',
      '-o',
      'downloaded.mp4',
    ]);

    console.log('テスト成功');

    res.send('OK');

  } catch (err) {
    console.error(err);

    res.status(500).send(err.message);
  }
});

app.listen(3001, () => {
  console.log('Server running on port 3001');
});