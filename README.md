# 帳票発行ツール（請求書・発注書・納品書・領収書）

社内向けの帳票作成 Web アプリです。Firebase（Authentication / Firestore / Hosting）上で動作します。

## 主な機能

- **4種類の帳票**: 請求書・発注書・納品書・領収書
- **インボイス制度対応**: 登録番号の記載、税率（10% / 8%軽減 / 対象外）ごとの合計と消費税額の区分記載、税率ごとに1回だけ端数処理
- 外税 / 内税、端数処理（切り捨て・四捨五入・切り上げ）の切り替え
- **自動採番**: `INV-2026-0001` のように種別・年ごとの連番（Firestore トランザクションで重複防止）。プレフィックスは設定で変更可
- **帳票の変換・複製**: 「この内容で作成…」で 発注書 → 納品書 → 請求書 → 領収書 のように明細を引き継いで作成
- 編集中のリアルタイムプレビュー、**A4 印刷 / PDF 保存**（ブラウザの印刷ダイアログで「PDFに保存」）
- 取引先マスタ、自社情報（社印画像・振込先・備考の初期値など）の管理
- 一覧での種別・状態（下書き／発行済／入金済／取消）・発行月・キーワード絞り込み
- 領収書: 但し書き、税抜 5 万円以上で収入印紙欄を表示（クレジットカード払いは除く）
- **Google アカウントでログイン**し、指定ドメイン（既定: `@inclue-llc.jp`）のユーザーのみ利用可能。Firestore セキュリティルールでもサーバー側で制限

## 技術構成

Vite + React + TypeScript / Firebase JS SDK v11 / 外部 UI ライブラリなし

```
src/
  components/   Layout, DocumentPreview（帳票レイアウト）, ItemsEditor（明細入力）
  contexts/     AuthContext（ログイン・ドメイン制限）, SettingsContext（自社設定）
  lib/          calc.ts（金額・消費税計算）, format.ts, docTypes.ts
  pages/        DocumentList, DocumentEdit, DocumentPrint, Clients, Settings, Login
  services/     Firestore アクセス（documents / clients / settings）
firestore.rules  セキュリティルール
```

## セットアップ

### 1. Firebase プロジェクトを作成

1. [Firebase コンソール](https://console.firebase.google.com/) でプロジェクトを作成
2. **Authentication** → ログイン方法 → **Google** を有効化
3. **Firestore Database** を作成（本番モード、ロケーションは `asia-northeast1`（東京）推奨）
4. プロジェクトの設定 → マイアプリ → **ウェブアプリを追加**し、表示される設定値を控える

### 2. ローカル設定

```bash
npm install
cp .env.example .env                 # Firebase の設定値を記入
cp .firebaserc.example .firebaserc   # プロジェクトIDを記入
```

ログインを許可するドメインを変更する場合は、`.env` の `VITE_ALLOWED_DOMAIN` と
`firestore.rules` の `isMember()` 内の正規表現の **両方** を変更してください。

### 3. 開発サーバー

```bash
npm run dev
```

Firebase Emulator を使う場合（Java が必要）は `.env` で `VITE_USE_EMULATOR=true` にして、別ターミナルで:

```bash
npm run emulators
```

### 4. デプロイ

```bash
npm install -g firebase-tools
firebase login
npm run deploy     # ビルド + Hosting と Firestore ルールをデプロイ
```

デプロイ後、Authentication → 設定 → **承認済みドメイン** に Hosting のドメイン（`xxx.web.app` 等。独自ドメインを使う場合はそれも）が含まれていることを確認してください。

## 使い方

1. 初回は **自社設定** で会社名・住所・登録番号・振込先・社印画像を登録
2. **取引先** を登録（帳票作成時に直接入力も可）
3. 上部メニューから帳票を作成 → 「保存して印刷 / PDF」
4. 印刷画面で「印刷 / PDFで保存」→ 送信先「PDFに保存」、用紙 A4・余白「なし」・「背景のグラフィック」オン

## テスト

```bash
npm test        # 金額計算・日付処理のユニットテスト
npm run build   # 型チェック + 本番ビルド
```

## データ構造（Firestore）

| コレクション | 内容 |
| --- | --- |
| `documents` | 帳票本体（種別・番号・宛先・明細・計算済み合計・作成者など） |
| `clients` | 取引先マスタ |
| `settings/company` | 自社情報・初期値 |
| `counters/{type}_{year}` | 採番用カウンタ |

## 注意事項

- 帳票データは社内ユーザー全員で共有されます（ユーザーごとの権限分けは未実装）
- 電子帳簿保存法に基づく電子取引データの保存要件（検索要件・改ざん防止等）への対応は、運用ルールと合わせてご確認ください
