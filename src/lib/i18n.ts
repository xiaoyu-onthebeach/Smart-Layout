import { useAppStore } from '@/store/useAppStore';
import type { Language } from '@/store/types';

/**
 * Every UI string is keyed by its own English source text — translating a screen is just wrapping
 * each literal with `t(...)`, no separate key namespace to keep in sync. Falls back to the English
 * source itself for any string not yet in the table, so a missed spot degrades to English rather
 * than a blank or a raw key.
 */
export const ja: Record<string, string> = {
  // Shell / chrome
  Primary: 'プライマリ',
  'Add banner': 'バナーを追加',
  'All banners': 'すべてのバナー',
  'No banners yet.': 'まだバナーがありません。',
  Assets: 'アセット',
  'View all': 'すべて表示',
  'All sizes': 'すべてのサイズ',
  Editing: '編集',
  'Single banner': '単一バナー',
  Select: '選択',
  Move: '移動',
  Brush: 'ブラシ',
  Eraser: '消しゴム',
  Text: 'テキスト',
  Shape: 'シェイプ',
  Image: '画像',
  Headline: '見出し',
  'Sub message': 'サブメッセージ',
  Price: '価格',
  Button: 'ボタン',
  Badge: 'バッジ',
  Expand: '拡大',
  'Re-generate': '再生成',
  'Split into layers': 'レイヤーに分割',
  'Create your first banner set!': '最初のバナーセットを作成しましょう！',
  'Pick your target platform and design one primary banner, and adapt to every required size easily.':
    'ターゲットとするプラットフォームを選び、プライマリバナーを1つデザインすれば、必要なすべてのサイズに簡単に対応できます。',
  'Create new banner': '新しいバナーを作成',
  Help: 'ヘルプ',
  Account: 'アカウント',
  'Sign out': 'ログアウト',

  // MultiPageCanvas (view-all canvas)
  'Add more sizes': 'サイズを追加',
  'Add more variations of this banner in different sizes': 'このバナーの別サイズのバリエーションを追加します',
  'ALL SIZES': 'すべてのサイズ',
  'Add page': 'ページを追加',
  'No pages yet — use "+ New page" to start.': 'ページがありません — 「+ 新規ページ」から開始してください。',
  'PRIMARY SIZE': 'プライマリサイズ',

  // ArtboardFrame / ArtboardScene
  Choose: '選択',
  'or drag your visual': 'または画像をドラッグ',
  Confirm: '確定',
  'Draw a rectangle around the scene focus': 'フォーカスにする範囲を四角で囲んでください',
  'New Banner': '新しいバナー',

  // Image dialogs
  'Choose a visual': '画像を選択',
  Search: '検索',
  Close: '閉じる',
  'Beachside visuals': 'Beachside ビジュアル',
  Upload: 'アップロード',
  'All visuals': 'すべての画像',
  'Uploaded image': 'アップロード済みの画像',
  'Expand image': '画像を拡大',
  'Describe the expanded area...': '拡大するエリアを入力…',

  // Size-select & templates
  'Choose the primary banner size': 'メインバナーサイズを選択',
  Cancel: 'キャンセル',
  'Each platform size brings its own rules — safe zones, font minimums and text limits appear on the banner scene as you design.':
    'プラットフォームのサイズごとにルールがあります。セーフゾーン、フォントの最小サイズ、文字数制限がデザイン中のバナーシーン上に表示されます。',
  'Custom size': 'カスタムサイズ',
  Width: '幅',
  Height: '高さ',
  'Use custom size': 'カスタムサイズを使用',
  'Find the banner size': 'バナーサイズを検索',
  'Recommended Size': 'おすすめサイズ',
  'Product hero': '商品ヒーロー',
  'Sale / promo': 'セール・プロモーション',
  'Multi-product': '複数商品',
  'Text-led': 'テキスト訴求',
  Platform: 'プラットフォーム',
  'All platforms': 'すべてのプラットフォーム',
  'Size class': 'サイズクラス',
  Category: 'カテゴリ',
  'All categories': 'すべてのカテゴリ',
  'No templates match these filters.': 'この条件に一致するテンプレートがありません。',
  wide: 'ワイド',
  landscape: '横長',
  square: '正方形',
  portrait: '縦型',
  tall: '縦長',

  // Page/scene toolbars
  Rename: '名前を変更',
  'Apply changes to all sizes': 'すべてのサイズに変更を適用',
  'Push changes to all sizes': 'すべてのサイズに変更をプッシュ',
  'Fit to screen': '画面に合わせる',
  'Disable snapping': 'スナップを無効にする',
  'Enable snapping': 'スナップを有効にする',
  'Copy layer': 'レイヤーをコピー',
  'Duplicate layer': 'レイヤーを複製',
  'Lock layer': 'レイヤーをロック',
  'Split in layers': 'レイヤーに分割',
  'Takes a few minutes': '数分かかります',
  'Bring to front': '最前面へ',
  'Send to back': '最背面へ',
  'Flip horizontal': '左右反転',
  'Flip vertical': '上下反転',
  'Insert new image': '新しい画像を挿入',
  'Delete layer': 'レイヤーを削除',
  'Search sizes': 'サイズを検索',
  'Scene focus point': 'シーンのフォーカスポイント',
  'Image expands around your selected area.': '選択した範囲を中心に画像が拡張されます。',
  'Scene focus': 'シーンのフォーカス',
  Change: '変更',
  'Pick the scene focus': 'シーンのフォーカスを選択',
  Pick: '選択',
  'Other sizes': 'その他のサイズ',
  'Add custom size': 'カスタムサイズを追加',

  // Inspector / layers / export
  Background: '背景',
  Back: '戻る',
  Layers: 'レイヤー',
  'Select a banner to see its layers': 'バナーを選択するとレイヤーが表示されます',
  Images: '画像',
  'No images across these scenes.': 'これらのシーンには画像がありません。',
  Edit: '編集',
  Replace: '置き換え',
  'Selection colors': '選択項目のカラー',
  'No colors found.': 'カラーが見つかりません。',
  Fill: '塗りつぶし',
  Export: 'エクスポート',
  Size: 'サイズ',
  'Export settings': 'エクスポート設定',
  'File type': 'ファイル形式',

  // Shape/text/image editor sub-panels
  'Select in all sizes': 'すべてのサイズで選択',
  'Stop select in all sizes': 'すべてのサイズでの選択を解除',
  Left: '左',
  Center: '中央',
  Right: '右',
  Top: '上',
  Middle: '中央',
  Bottom: '下',
  Alignment: '配置',
  Position: '位置',
  'Anchor type': 'アンカータイプ',
  Smart: 'スマート',
  Color: 'カラー',
  'Uniform radius': '均一な角丸',
  'Per-corner radius': 'コーナーごとの角丸',
  'Hide layer': 'レイヤーを非表示',
  'Show layer': 'レイヤーを表示',
  None: 'なし',
  Solid: '実線',
  Dashed: '破線',
  Dotted: '点線',
  Banner: 'バナー',
  'Set as Primary': 'プライマリに設定',
  Border: '枠線',
  Style: 'スタイル',
  Radius: '角丸',
  Styles: 'スタイル',
  Regular: 'レギュラー',
  Medium: 'ミディアム',
  'Semi Bold': 'セミボールド',
  Bold: '太字',
  'Extra Bold': 'エクストラボールド',
  Underline: '下線',
  Strikethrough: '取り消し線',
  Content: 'コンテンツ',
  'placeholder text': 'プレースホルダーテキスト',
  Spacing: '間隔',
  Stretch: '伸縮',
  'Line height': '行の高さ',
  Decoration: '装飾',
  'Expand to frame': 'フレームに合わせる',
};

export function translate(text: string, language: Language): string {
  if (language === 'en') return text;
  return ja[text] ?? text;
}

/** `const t = useT()` then wrap literals as `t('Some label')`. Re-renders on language change. */
export function useT() {
  const language = useAppStore((s) => s.language);
  return (text: string) => translate(text, language);
}
