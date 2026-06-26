# 社内ポータル

社内の各種アプリケーションへのアクセスをまとめたポータルサイトです。

## 機能

- ✅ ダッシュボード（各アプリへのランチャー）
- ✅ Google Workspace OAuth 認証
- ✅ ユーザー管理（計画中）
- ✅ 権限管理（計画中）

## 技術スタック

### フロントエンド
- React 18
- Vite
- Tailwind CSS
- Axios

### バックエンド
- Node.js + Express
- Supabase
- JWT 認証

## セットアップ

### 1. リポジトリクローン
```bash
git clone https://github.com/yourcompany/portal.git
cd portal
```

### 2. バックエンド設定（別フォルダ 04.portal-api）
```bash
cd ../04.portal-api
cp .env.example .env
# .env に以下を設定：
# SUPABASE_URL=... (Supabase プロジェクト URL)
# SUPABASE_ANON_KEY=... (Supabase 公開キー)
# GOOGLE_CLIENT_ID=... (Google OAuth Client ID)
# GOOGLE_CLIENT_SECRET=... (Google OAuth Secret)
npm install
npm run dev
```

### 3. フロントエンド設定
```bash
cd app/frontend
cp .env.example .env
# .env に以下を設定：
# VITE_GOOGLE_CLIENT_ID=...
npm install
npm run dev
```

ブラウザで `http://localhost:5173` にアクセス

## API エンドポイント

- `GET /health` - ヘルスチェック
- `GET /api/apps` - アプリ一覧
- `POST /api/auth/google` - Google OAuth 認証（実装予定）
- `GET /api/user` - ユーザー情報取得（実装予定）

## Google OAuth 設定

1. [Google Cloud Console](https://console.cloud.google.com) にアクセス
2. 新規プロジェクト作成
3. 「Google+ API」を有効化
4. OAuth 2.0 認証情報を作成：
   - タイプ: Web アプリケーション
   - リダイレクト URI: 
     - ローカル: `http://localhost:5173/callback`
     - 本番: `https://your-portal-domain.com/callback`
5. Client ID と Secret を `.env` に設定

## デプロイ

### バックエンド（Render）

1. GitHub にリポジトリをプッシュ
2. [Render.com](https://render.com) で新規プロジェクト作成
3. GitHub をデプロイする場合：
   - Deploy from Git → このリポジトリを選択
   - Render が自動で `render.yaml` から設定を読み込む
4. 環境変数を設定：
   - SUPABASE_URL
   - SUPABASE_ANON_KEY
   - GOOGLE_CLIENT_ID
   - GOOGLE_CLIENT_SECRET

### フロントエンド（Vercel）

1. [Vercel.com](https://vercel.com) で新規プロジェクト作成
2. GitHub から import
3. Project Settings で以下を設定：
   - Root Directory: `app/frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Environment Variables:
   - VITE_API_URL: Render API URL
   - VITE_GOOGLE_CLIENT_ID: Google Client ID

## トラブルシューティング

### CORS エラー
- バックエンド: `.env` の API URL が正しいか確認
- CORS が Express で有効か確認

### Supabase 接続エラー
- SUPABASE_URL と SUPABASE_ANON_KEY を確認
- Supabase ダッシュボードで CORS ホワイトリスト設定確認

### Google OAuth エラー
- Client ID と Secret を確認
- リダイレクト URI が Google Cloud Console に登録されているか確認

## 今後の実装予定

- [ ] ユーザー管理画面（管理者向け）
- [ ] 権限管理（各アプリへのアクセス制御）
- [ ] ユーザー検索・フィルター
- [ ] ダッシュボードのカスタマイズ
- [ ] 統計・分析機能
- [ ] 通知機能

## ライセンス

Internal Use Only

## 開発チーム

DX 推進チーム
