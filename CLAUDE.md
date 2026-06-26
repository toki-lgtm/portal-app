# ポータルアプリ - Claude Code ガイド

## プロジェクト概要
- **名称**: 社内ポータル
- **企業**: 中原建設
- **従業員数**: 約50人
- **スタック**: React（Vite）+ Node.js + Supabase
- **目的**: 各種社内アプリケーションへのアクセスをまとめたポータル

## ディレクトリ構成
```
03.portal-app/        ← このフォルダ（フロントエンド）
  └── app/frontend/   React + Vite + Tailwind + Electron
04.portal-api/        ← バックエンド本体（Express + Supabase）※別フォルダ
```
> 注: 以前 app/backend/ に古いスタブがありましたが、本番APIは 04.portal-api に一本化済み。
> 旧スタブは 04.アプリ/_archive/03-portal-old-backend/ に退避。

## セットアップ
```bash
# バックエンド（別フォルダ 04.portal-api）
cd ../04.portal-api
npm install
cp .env.example .env  # Supabase / Google OAuth 認証情報を設定
npm run dev

# フロントエンド（別ターミナル）
cd app/frontend
npm install
cp .env.example .env  # VITE_API_URL / VITE_GOOGLE_CLIENT_ID を設定
npm run dev
```

## あなたの指示方法

以下のように指示してください：
- 「ダッシュボードに〜機能を追加して」
- 「Google OAuth 認証を実装して」
- 「ユーザー管理画面を追加して」
- 「〜アプリのリンクを追加して」

技術的な細部は Claude が判断します。

## Claude の自動実行範囲

✅ ファイル編集・作成  
✅ コンポーネント実装  
✅ API エンドポイント追加  
✅ 認証ロジック実装  
✅ バグ修正  
✅ デプロイ設定

## 重要な設計原則

1. **バグの隔離**
   - 各アプリが独立している
   - ポータルのバグが他のアプリに波及しない

2. **複数アプリ間の連携**
   - ポータルのユーザー情報を各アプリが参照
   - API 経由で疎結合

3. **Google Workspace の活用**
   - OAuth は Google Workspace アカウントで統一
   - ユーザー管理も Workspace 連携（将来）

## 完成度チェック

機能実装後、以下を確認：
- ✅ ローカル（npm run dev）で動作確認
- ✅ バグなし
- ✅ UI/UX が直感的

## デプロイフロー

```
ローカル開発
    ↓
GitHub push
    ↓
Render（バックエンド）自動デプロイ
    ↓
Vercel（フロントエンド）自動デプロイ
    ↓
本番環境で利用可能
```

完了時は日本語で簡潔に報告します。
