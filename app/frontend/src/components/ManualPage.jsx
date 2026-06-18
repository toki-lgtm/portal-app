import { useState, useMemo, useRef } from 'react'
import {
  ArrowLeft, Search, BookOpen, LogIn, LayoutDashboard, Settings,
  ShieldCheck, Users, Megaphone, Gavel, Building2, FolderOpen,
  IdCard, MonitorDown, Bug, HelpCircle, ChevronRight,
} from 'lucide-react'
import Button from './ui/Button'
import Badge from './ui/Badge'

/**
 * 社内ポータル操作マニュアル（読み取り専用の静的ページ）。
 * - APIは呼ばない。内容は下の MANUAL データを編集すれば更新できる。
 * - 左に目次、右に本文。上部の検索で章・項目を絞り込める。
 *
 * 各章の構造:
 *   { id, icon, title, badge?, intro, groups: [{ heading, admin?, items: string[] }] }
 * items の各文字列が一手順。先頭が「→」のものは前の手順の補足として字下げ表示する。
 */

const ADMIN = '管理者のみ'

const MANUAL = [
  {
    id: 'getting-started',
    icon: LogIn,
    title: 'はじめに（ログインと基本操作）',
    intro:
      '社内ポータルは、安全パトロールや入札案件管理など各種の社内アプリへ1か所からアクセスできる入口です。Google Workspace アカウントでログインして利用します。',
    groups: [
      {
        heading: 'ログインする',
        items: [
          'ポータルのURLを開く（PC・スマートフォンどちらのブラウザでも利用できます）。',
          '「Google でログイン」ボタンを押す。',
          '会社から配布された Google Workspace アカウント（@nakahara131.co.jp など）を選ぶ。',
          'ログインに失敗する場合は、個人のGoogleアカウントではなく会社アカウントでログインしているか確認してください。',
        ],
      },
      {
        heading: '画面共通の操作',
        items: [
          '各機能の画面では、左上の「戻る」ボタンでダッシュボード（最初の画面）へ戻れます。',
          '画面右上の歯車アイコンで「個人設定」、ベルアイコンで「通知」を開けます。',
          '画面右上のテーマ切替アイコンで、明るい表示／暗い表示を切り替えられます。',
          '右上の「ログアウト」で終了します。共用PCでは必ずログアウトしてください。',
          '画面右下に常に表示される「バグ報告・改善」ボタンから、どの画面からでも不具合の報告ができます。',
        ],
      },
      {
        heading: 'スマートフォンでの表示',
        items: [
          '画面の幅に合わせて自動でレイアウトが変わります（PCは表形式、スマホはカード形式など）。',
          '基本的な操作はPCと同じです。',
        ],
      },
    ],
  },
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    title: 'ダッシュボードの見方',
    intro:
      'ログイン後に最初に表示される画面です。利用できるアプリの一覧と、安全パトロール・入札・お知らせ・文書回覧などの最新状況がまとまっています。',
    groups: [
      {
        heading: '利用可能なアプリ',
        items: [
          '自分に権限のあるアプリがカードで並びます。カードを押すとそのアプリが開きます。',
          '並び順は「よく使う順」に自動で整列します（ピン留め→使用回数の多い順）。',
          'カードに★が付いていればお気に入り、押しピンが付いていればピン留めです（個人設定で変更できます）。',
        ],
      },
      {
        heading: '状況サマリ（KPI）',
        items: [
          '上部に「安全パトロール状況」（今月の点検・是正完了率・是正対応中・承認待ち）が表示されます。',
          '入札案件の権限がある人には「入札案件の状況」（進行中・今月の入札・期限間近・落札率）も表示されます。',
          '見出しを押すと、それぞれのアプリ画面へ移動できます。',
          '安全パトロールのサマリは個人設定で非表示にできます。',
        ],
      },
      {
        heading: 'お知らせ・文書回覧・最近の点検カード',
        items: [
          '画面下部に「お知らせ」「文書回覧」「最近の点検」のカードが並びます。',
          '各カードの「一覧を見る」から、それぞれの機能の全画面へ移動できます。',
          '未読がある場合はカードに件数バッジが表示されます。',
        ],
      },
      {
        heading: '通知ベル',
        items: [
          '右上のベルアイコンに未対応の件数がまとまって表示されます。',
          '未読のお知らせ・未読の回覧・安全パトロールの承認待ち／是正対応中などが確認できます。',
          '項目を押すと該当の画面へ移動できます。',
        ],
      },
    ],
  },
  {
    id: 'settings',
    icon: Settings,
    title: '個人設定',
    intro:
      '画面の見た目や通知の受け取り方を自分好みに変えられます。設定は自分のアカウントにだけ反映されます。右上の歯車アイコンから開きます。',
    groups: [
      {
        heading: '表示・テーマ（押すと即反映）',
        items: [
          'テーマ：「ライト」「ダーク」「システム連動」から選びます。',
          '文字サイズ：「標準」「大きめ」から選びます。',
          '起動時に開く画面：「ダッシュボード」または「アプリ選択」を選びます。',
          '→ これらはこの端末（ブラウザ）にだけ保存され、別の端末には引き継がれません。',
        ],
      },
      {
        heading: 'アプリのカスタマイズ／通知（「設定を保存」が必要）',
        items: [
          'アプリ一覧で押しピンアイコンを押すとピン留め、星アイコンを押すとお気に入りになります。',
          '「安全パトロール状況を表示する」のスイッチでダッシュボードのKPI表示を切替できます。',
          '「アプリ内通知を受け取る」のスイッチで通知ベルの表示を切替できます。',
          'メール通知をオンにすると、受け取る曜日と送信時刻を選べます。',
          '最後に画面右下の「設定を保存」ボタンを必ず押してください（これらはサーバーに保存され、別の端末でも反映されます）。',
        ],
      },
    ],
  },
  {
    id: 'safety-patrol',
    icon: ShieldCheck,
    title: '安全パトロール',
    intro:
      '月次の安全点検を記録・管理するアプリです。現場ごとに点検項目を入力し、指摘があれば是正対応（写真提出）→承認まで追跡できます。報告書PDFの自動作成と作業所長へのメール送信もできます。ダッシュボードのアプリカードから開きます（自動でログインされます）。',
    groups: [
      {
        heading: '全体の流れ',
        items: [
          '①新規点検を入力・保存 → ②点検一覧で内容を確認 → ③PDF生成（以降は編集不可） → ④作業所長へメール送信 → ⑤作業所長が是正写真を提出 → ⑥検査員が承認または差し戻し。',
        ],
      },
      {
        heading: '新規点検を入力する（新規点検タブ）',
        items: [
          'ステップ1：点検日・現場・検査員（必須）、作業所長、対象区分（1つ以上）を選び「次へ」。',
          'ステップ2〜：選んだ区分ごとに各項目を「合」または「不合」で評価します。',
          '→「不合」を選ぶと、指摘内容（必須）・指摘写真・改善期限の入力欄が開きます。',
          '→「よく使う指摘内容」のタグを押すと、過去の入力から指摘内容を自動入力できます。',
          '最終ステップ：全体コメント・現場写真を入力し「保存する」を押します。',
        ],
      },
      {
        heading: '点検を確認・PDF化・送信する（点検一覧タブ）',
        items: [
          '行を押すと点検詳細が開き、全項目・写真・是正状況を確認できます。',
          '「PDF生成」を押すと報告書PDFが自動作成されます（生成後は点検内容を編集できなくなります）。',
          '「PDF表示」で作成済みPDFを開けます。',
          '「メール送信」で作業所長（とCC対象者）へPDFを送付します。送付済みなら「再送信」と表示されます。',
          '検索・現場／検査員／ステータスでの絞り込み・並び替えができます。',
        ],
      },
      {
        heading: '是正対応する（是正対応タブ／点検詳細）',
        items: [
          '開くと自分が対応すべき指摘（要対応）だけが表示されます。「すべて」で全件表示。',
          '作業所長：是正写真とコメントを入力して「是正を提出」。',
          '検査員：内容を確認して「承認」、または「差し戻し」（理由を入力）。',
        ],
      },
      {
        heading: 'マスター管理',
        admin: true,
        items: [
          '「現場」タブ：現場名・所在地の追加・編集・削除。',
          '「対象区分」タブ：点検項目（区分・内容）の追加・編集・削除。',
          '「社員」タブ：安全パトロールのメンバー／管理者権限の切替、レポートCC対象の確認。',
          '→ 社員自体の追加・削除はポータルの「社員一覧」で行います。',
        ],
      },
      {
        heading: '注意点',
        items: [
          'ログイン画面はありません。必ずポータルのアプリカードから開いてください。',
          'PDF生成後は点検内容を編集できません。内容をよく確認してから生成してください。',
          '6か月を過ぎた点検は自動でアーカイブされ、写真・PDFは共有ドライブへ移動されます（記録の閲覧は可能）。',
        ],
      },
    ],
  },
  {
    id: 'employees',
    icon: Users,
    title: '社員一覧',
    intro:
      '会社・グループ会社の社員情報を一覧で確認・管理できます。資格の保有状況や有効期限もまとめて把握できます。',
    groups: [
      {
        heading: '全員ができること',
        items: [
          '検索欄に氏名・ふりがな・メール・職種などを入力して絞り込めます。',
          '会社・部署・在籍状況のプルダウンで絞り込み、列ヘッダーで並び替えができます。',
          '行を押すと詳細（基本情報・アプリ権限・資格）が開きます。',
          '「CSV出力」で表示中の一覧をExcelで開ける形式でダウンロードできます。',
          '「共有メール」で拠点・部署の共有アドレス一覧を開き、コピーできます。',
        ],
      },
      {
        heading: '管理者ができること',
        admin: true,
        items: [
          '「社員を追加」で新規登録、行を開いて編集・削除。',
          '「アプリ権限」タブで各アプリに「なし／利用可／管理者」を設定し「権限を保存」。',
          '「資格」タブで資格を手入力、または「資格者証をスキャン」でAI自動入力。',
          '「資格者証を取込」でPDF・画像を一括取込（照合できたものは自動保存、不明分は「要確認」で保存）。',
          '「資格マスタ」で資格の種類を管理、共有メールの追加・編集・パスワード閲覧。',
        ],
      },
      {
        heading: '補足',
        items: [
          '資格の有効期限が90日以内で「期限間近」、超過で「期限切れ」バッジが表示されます。',
        ],
      },
    ],
  },
  {
    id: 'announcements',
    icon: Megaphone,
    title: 'お知らせ（掲示板）',
    intro:
      '社内のお知らせを投稿・閲覧できる掲示板です。重要なお知らせには「確認しました」ボタンを付けて到達を記録できます。',
    groups: [
      {
        heading: '全員ができること',
        items: [
          'カードを押すと詳細が開き、その時点で「既読」になります。',
          '検索、カテゴリでの絞り込み、「未読のみ」表示ができます。',
          '「要確認」のお知らせは、開いて「確認しました」を押すと到達が記録されます。',
          '添付ファイルは詳細画面からダウンロードできます。',
        ],
      },
      {
        heading: '管理者ができること',
        admin: true,
        items: [
          '「新規投稿」で件名・本文・添付・カテゴリ・重要度・宛先・掲載期間・ピン留め・確認要否を設定して投稿。',
          '宛先は「全員／会社指定／部署指定」から選べます。',
          '詳細から編集・削除、「到達率を確認」で既読数・確認数・社員ごとの状況を確認できます。',
          '「管理モード」で期限切れ・宛先外を含む全件を表示できます。',
        ],
      },
    ],
  },
  {
    id: 'bids',
    icon: Gavel,
    title: '入札案件管理',
    intro:
      '工事の入札案件を情報収集から契約まで一元管理できます。AIによる書類の自動読み取りや積算データの取込にも対応しています。',
    groups: [
      {
        heading: '案件を見る・登録する',
        items: [
          '「案件一覧」タブで検索・ステータス絞り込み・並び替えができます。',
          '行を押すと詳細（基本情報／金額・結果／資料／履歴）が開きます。',
          '詳細上部のプルダウンでステータスを変更できます（利用可の人も操作可能）。',
          '「新規登録」で手入力、または「資料を選択」→「資料から自動入力」でAIが書類を読み取って入力します。',
        ],
      },
      {
        heading: '詳細画面でできること',
        items: [
          '金額・結果タブ：「積算Excel取込」で積算ソフトのExcelから積算金額を自動入力。',
          '資料タブ：設計書・図面などを種別を選んでアップロード・ダウンロード。',
          '落札・契約の案件は「工事へ昇格」で書類を引き継いで工事管理へ自動登録できます。',
          '「分析」タブで落札率（件数・金額）・平均応札率・発注者別／工種別の落札率を確認できます。',
        ],
      },
      {
        heading: '管理者ができること',
        admin: true,
        items: ['案件の編集・削除、資料の削除。'],
      },
    ],
  },
  {
    id: 'construction',
    icon: Building2,
    title: '工事管理',
    intro:
      '工事ごとに提出書類・検査書類の進捗を一元管理できます（九州防衛局 建築工事向け）。締切管理やAIによる書類の自動振り分けに対応しています。',
    groups: [
      {
        heading: '工事を登録・確認する',
        items: [
          '一覧上部のKPIで「進行中・期限超過・締切間近・差戻し」の件数を確認できます。',
          '「工事を追加」で登録。「必要書類チェックリストを自動生成する」にチェックすると締切が自動計算されます。',
          '「書類を選択」で契約書等をアップロードすると、AIが工事情報を読み取って空欄を自動入力します。',
          'カードを押すと詳細（基本情報・数量内訳・設計変更・書類チェックリスト）が開きます。',
        ],
      },
      {
        heading: '提出書類チェックリスト',
        items: [
          '各書類のプルダウンでステータス（未着手〜承認・差戻し・対象外）を変更すると即保存されます。',
          '鉛筆アイコンから締切・提出日・ファイル参照・メモを編集、ファイル添付ができます。',
          '「AIで振り分けアップロード」でファイルを選ぶと、AIが該当書類へ自動で振り分け添付します。',
        ],
      },
      {
        heading: '数量内訳・設計変更',
        items: [
          '「数量書(xlsx)を取込」で積算ソフトのExcelを取り込み、工種別構成比をグラフ表示します。',
          '「書類を読み込んで設計変更を追加」で変更契約書をAI読み取りして登録、「反映」で契約金額・工期等を更新します。',
        ],
      },
      {
        heading: '管理者ができること',
        admin: true,
        items: ['工事の削除。'],
      },
      {
        heading: '補足',
        items: [
          '締切が過去の書類は赤字、14日以内はオレンジ色で表示されます。',
          'AIが振り分けた添付には「AI振分」ラベルが付きます。種別が正しいか確認してください。',
        ],
      },
    ],
  },
  {
    id: 'documents',
    icon: FolderOpen,
    title: '文書回覧',
    intro:
      'PDFや画像の書類を社員に電子回覧する機能です。受信した書類を確認し、フラグや対応状況を記録できます。',
    groups: [
      {
        heading: '受信トレイ（全員）',
        items: [
          '自分宛の回覧が一覧表示されます（未読は青い縦線と「未読」バッジ）。',
          '検索、「未読のみ」、「要対応／重要」での絞り込みができます。',
          'カードを押すと原本をその場でプレビューできます（AI要約があれば表示）。',
          '「要対応」「重要」ボタンでフラグを付け、要対応は「対応済にする」で完了を記録できます。',
          '「到達状況を確認」で誰が読んだかを確認できます。',
        ],
      },
      {
        heading: '発信・管理',
        admin: true,
        items: [
          '「発信」タブでPDF・画像をアップロードすると、AIが自動分割し書類ごとに解析します。',
          '分割ウィザードで各書類のページ範囲・種別・差出人・件名・宛先を確認して送信します。',
          '宛先は「全員／会社／部署／ユーザー指定」から選べます。',
          '「管理」タブで自分が発信した書類の到達状況を確認できます。',
        ],
      },
    ],
  },
  {
    id: 'cards',
    icon: IdCard,
    title: '名刺管理',
    intro:
      '受け取った名刺を登録・閲覧・検索できます。カメラ撮影やファイル選択でAIが自動的に情報を読み取ります。',
    groups: [
      {
        heading: '名刺を探す・見る',
        items: [
          '検索欄に氏名・会社・役職・資格を入力して絞り込めます。',
          '「すべて／自分が登録／全社共有」で表示対象、プルダウンで並び替えを切替できます。',
          '「カード／テーブル」で表示形式、カテゴリのチップで分類別の絞り込みができます。',
          'クリックで詳細を表示、名刺画像はクリックで拡大できます。',
        ],
      },
      {
        heading: '名刺を登録する',
        items: [
          '「撮影・ファイルで登録」→画像を選ぶとAIが自動入力。内容を確認・修正して「登録する」。',
          '「手入力で登録」で直接入力もできます。',
          '会社名を入力すると業種カテゴリが自動提案されます。',
          '「公開範囲」で「全社共有」か「個人のみ」を選べます。',
        ],
      },
      {
        heading: '補足',
        items: [
          '自分が登録した名刺は編集・削除できます（管理者は他人の名刺も可）。',
          '「マイカテゴリ」は自分だけに見える個人ラベルです。',
        ],
      },
    ],
  },
  {
    id: 'workscope',
    icon: MonitorDown,
    title: 'WorkScope 導入',
    intro:
      '業務記録ツール「WorkScope」のインストーラーをポータルからダウンロードし、自分のPCに導入するための画面です。',
    groups: [
      {
        heading: 'インストール手順',
        items: [
          '利用規約・プライバシーポリシーへの同意チェックを入れます。',
          '「インストーラーをダウンロード」を押すと WorkScope_setup.zip がダウンロードされます。',
          'zipを右クリック→「すべて展開」で解凍します。',
          'フォルダ内の installer を開き、「WorkScope_インストール.bat」を右クリック→「管理者として実行」。',
          '利用規約に同意し、氏名（フルネーム）とGoogle Driveフォルダを入力してインストールします。',
          '完了画面が出れば導入完了です（以降は自動でバックグラウンド記録されます）。',
        ],
      },
      {
        heading: '管理者メニュー',
        admin: true,
        items: [
          'インストーラーのアップロード（バージョン更新）。',
          '導入状況（導入済み／未導入の人数・一覧）、利用規約の同意状況の確認。',
        ],
      },
      {
        heading: '補足',
        items: [
          'インストーラーが未登録の場合は「管理者の準備をお待ちください」と表示されます。',
          'PythonやActivityWatchが未導入でもインストーラーが自動導入します（初回は数分かかります）。',
        ],
      },
    ],
  },
  {
    id: 'feedback',
    icon: Bug,
    title: 'バグ報告・改善要望',
    intro:
      'ポータルや各アプリの不具合・改善要望を送信し、対応状況を確認できます。画面右下の常駐ボタンからいつでも報告できます。',
    groups: [
      {
        heading: '報告する',
        items: [
          '右下の「バグ報告・改善」ボタンを押してフォームを開きます。',
          '「バグ報告」か「改善要望」を選び、タイトル（必須）・対象アプリ・内容を入力します。',
          'バグの場合は再現手順・期待／実際の動作・深刻度・発生頻度も入力できます。',
          'スクリーンショットを複数枚添付できます。',
          '「送信する」で完了（URL・OS・画面サイズが自動で記録されます）。',
        ],
      },
      {
        heading: '対応状況の確認',
        items: [
          '自分が送った報告の一覧と対応状況メモを確認できます。',
        ],
      },
      {
        heading: '管理者ができること',
        admin: true,
        items: [
          '全社員からの報告を一覧・フィルタし、ステータス・優先度・対応内容を更新できます。',
          '「バックログ出力」で未対応の報告をまとめてMarkdownでダウンロードできます。',
        ],
      },
    ],
  },
  {
    id: 'faq',
    icon: HelpCircle,
    title: 'よくある質問（FAQ）',
    intro: 'つまずきやすい点をまとめました。',
    groups: [
      {
        heading: 'ログイン・表示',
        items: [
          'Q. ログインできない → A. 個人のGoogleアカウントではなく、会社のWorkspaceアカウントでログインしてください。',
          'Q. アプリが表示されない → A. そのアプリの利用権限がない可能性があります。社員一覧の管理者に権限付与を依頼してください。',
          'Q. 文字が小さい／まぶしい → A. 個人設定で文字サイズやテーマ（ライト／ダーク）を変更できます。',
        ],
      },
      {
        heading: '通知・並び順',
        items: [
          'Q. 通知が来ない → A. 個人設定で「アプリ内通知」やメール通知がオンか確認してください。',
          'Q. アプリの並びを変えたい → A. 個人設定でピン留めすると先頭に固定されます（それ以外はよく使う順に自動整列）。',
        ],
      },
      {
        heading: 'うまくいかないとき',
        items: [
          'Q. 操作がおかしい・エラーが出る → A. 画面右下の「バグ報告・改善」から、できればスクリーンショットを添えて報告してください。',
          'Q. 共用PCを使った → A. 作業後は必ず右上の「ログアウト」を押してください。',
        ],
      },
    ],
  },
]

// 章が検索語に一致するか（タイトル・概要・項目本文を対象）
function matchSection(section, q) {
  if (!q) return true
  const hay = [
    section.title,
    section.intro,
    ...section.groups.flatMap((g) => [g.heading, ...g.items]),
  ]
    .join('\n')
    .toLowerCase()
  return hay.includes(q.toLowerCase())
}

export default function ManualPage({ onBack }) {
  const [query, setQuery] = useState('')
  const sectionRefs = useRef({})

  const visible = useMemo(
    () => MANUAL.filter((s) => matchSection(s, query.trim())),
    [query]
  )

  const scrollTo = (id) => {
    const el = sectionRefs.current[id]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ink-950 transition-colors">
      {/* ヘッダー */}
      <header className="bg-white/80 dark:bg-ink-900/80 backdrop-blur border-b border-slate-200 dark:border-ink-800 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Button>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-brand-500" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">操作マニュアル</h1>
          </div>
          <div className="ml-auto relative w-full max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="マニュアルを検索"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-ink-600 bg-white dark:bg-ink-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex gap-8">
          {/* 目次（PCのみ・スクロール追従） */}
          <nav className="hidden lg:block w-60 shrink-0">
            <div className="sticky top-24">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">
                目次
              </p>
              <ul className="space-y-1">
                {visible.map((s) => {
                  const Icon = s.icon
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => scrollTo(s.id)}
                        className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-ink-800 hover:text-brand-600 dark:hover:text-brand-400 transition"
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{s.title}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </nav>

          {/* 本文 */}
          <div className="flex-1 min-w-0 space-y-6">
            {visible.length === 0 && (
              <div className="text-center py-20 text-slate-400 dark:text-slate-500">
                「{query}」に一致する項目は見つかりませんでした。
              </div>
            )}

            {visible.map((s) => {
              const Icon = s.icon
              return (
                <section
                  key={s.id}
                  ref={(el) => (sectionRefs.current[s.id] = el)}
                  className="scroll-mt-24 bg-white dark:bg-ink-800 rounded-2xl border border-slate-200 dark:border-ink-700 p-6"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{s.title}</h2>
                  </div>

                  {s.intro && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
                      {s.intro}
                    </p>
                  )}

                  <div className="space-y-5">
                    {s.groups.map((g, gi) => (
                      <div key={gi}>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-bold text-slate-800 dark:text-slate-100">{g.heading}</h3>
                          {g.admin && <Badge tone="warning">{ADMIN}</Badge>}
                        </div>
                        <ul className="space-y-1.5">
                          {g.items.map((item, ii) => {
                            const sub = item.startsWith('→')
                            const text = sub ? item.slice(1).trim() : item
                            return (
                              <li
                                key={ii}
                                className={`flex gap-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed ${sub ? 'pl-6' : ''}`}
                              >
                                <ChevronRight
                                  className={`w-4 h-4 mt-0.5 shrink-0 ${sub ? 'text-slate-300 dark:text-slate-600' : 'text-brand-400'}`}
                                />
                                <span>{text}</span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}

            <p className="text-center text-xs text-slate-400 dark:text-slate-500 pt-2">
              中原建設 社内ポータル 操作マニュアル ・ 不明点は画面右下「バグ報告・改善」からお問い合わせください
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
