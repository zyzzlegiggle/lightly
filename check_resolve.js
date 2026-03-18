try {
    const api = await import('@better-auth/core/api');
    console.log('Successfully resolved @better-auth/core/api');
} catch (e) {
    console.error('Failed to resolve @better-auth/core/api:', e.message);
    try {
        const core = await import('@better-auth/core');
        console.log('Successfully resolved @better-auth/core');
    } catch (e2) {
        console.error('Failed to resolve @better-auth/core:', e2.message);
    }
}
