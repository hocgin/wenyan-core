import { HttpAdapter } from "./http.js";
import { TokenStore, TokenStorageAdapter } from "./tokenStore.js";
import { UploadCacheStorageAdapter, UploadCacheStore } from "./uploadCacheStore.js";
import {
    createWechatClient,
    WechatPublishOptions,
    WechatPublishResponse,
    WechatUploadResponse,
    type WechatClient, WechatSubmitResponse, WechatSubmitOptions,
} from "./wechat.js";

export interface ArticleOptions {
    title: string;
    content: string;
    cover?: string;
    author?: string;
    source_url?: string;
}

export interface NewsPicOptions {
    title: string;
    content: string;
    cover?: string;
    image_urls?: [string];
}

export interface SubmitOptions {
    media_id: string;
}

export class WechatPublisher {
    private tokenStore: TokenStore | undefined;
    private uploadCacheStore: UploadCacheStore | undefined;
    private uploadMaterial: WechatClient["uploadMaterial"];
    private publishArticle: WechatClient["publishArticle"];
    private publishNewsPic: WechatClient["publishNewsPic"];
    private fetchAccessToken: WechatClient["fetchAccessToken"];
    private submitArticle: WechatClient["submitArticle"];

    constructor(
        httpAdapter: HttpAdapter,
        tokenStoreAdapter?: TokenStorageAdapter,
        uploadCacheStoreAdapter?: UploadCacheStorageAdapter,
    ) {
        const { uploadMaterial, publishArticle, publishNewsPic, fetchAccessToken, submitArticle } = createWechatClient(httpAdapter);
        this.uploadMaterial = uploadMaterial;
        this.publishArticle = publishArticle;
        this.fetchAccessToken = fetchAccessToken;
        this.submitArticle = submitArticle;
        this.publishNewsPic = publishNewsPic;
        this.tokenStore = tokenStoreAdapter ? new TokenStore(tokenStoreAdapter) : undefined;
        this.uploadCacheStore = uploadCacheStoreAdapter ? new UploadCacheStore(uploadCacheStoreAdapter) : undefined;
    }

    public async getAccessTokenWithCache(appId: string, appSecret: string): Promise<string> {
        if (!this.tokenStore) {
            const result = await this.fetchAccessToken(appId, appSecret);
            return result.access_token;
        }
        const cached = this.tokenStore.getToken(appId);
        if (cached) {
            return cached;
        }
        const result = await this.fetchAccessToken(appId, appSecret);
        await this.tokenStore.setToken(appId, result.access_token, result.expires_in);
        return result.access_token;
    }

    public async uploadImage(file: Blob, filename: string, accessToken: string): Promise<WechatUploadResponse> {
        let hash: string | undefined;
        if (this.uploadCacheStore) {
            const arrayBuffer = await file.arrayBuffer();
            hash = await this.uploadCacheStore.calcHash(arrayBuffer);
            const cached = await this.uploadCacheStore.get(hash);
            if (cached) {
                return {
                    media_id: cached.media_id,
                    url: cached.url,
                };
            }
        }
        const data = await this.uploadMaterial("image", file, filename, accessToken);
        if (this.uploadCacheStore && hash) {
            await this.uploadCacheStore.set(hash, data.media_id, data.url);
        }

        return data;
    }

    public async publishToDraft(accessToken: string, options: WechatPublishOptions): Promise<WechatPublishResponse> {
        return await this.publishArticle(accessToken, options);
    }

    public async publishNewsPicToDraft(accessToken: string, options: NewsPicOptions): Promise<WechatPublishResponse> {
        return await this.publishNewsPic(accessToken, options);
    }

    public async submit(accessToken: string, options: WechatSubmitOptions): Promise<WechatSubmitResponse> {
        return await this.submitArticle(accessToken, options);
    }
}
