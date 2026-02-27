export class MusicServiceError extends Error {
    status: number;

    constructor(message: string, status = 500) {
        super(message);
        this.name = 'MusicServiceError';
        this.status = status;
    }
}

