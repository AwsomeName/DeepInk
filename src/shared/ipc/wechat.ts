export interface WechatConvertResult {
  html?: string
  error?: string
}

export interface WechatApiContract {
  convert: (markdown: string) => Promise<WechatConvertResult>
}
