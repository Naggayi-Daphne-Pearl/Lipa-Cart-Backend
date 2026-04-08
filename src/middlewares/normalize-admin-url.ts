export default () => {
  return async (ctx: any, next: () => Promise<void>) => {
    const rawUrl = typeof ctx.req?.url === 'string' ? ctx.req.url : '';

    if (ctx.path === '/admin') {
      ctx.redirect('/admin/');
      return;
    }

    if (rawUrl.startsWith('api::') || rawUrl.startsWith('/api::')) {
      const normalized = rawUrl.startsWith('/') ? rawUrl.slice(1) : rawUrl;
      ctx.redirect(`/admin/content-manager/collection-types/${normalized}`);
      return;
    }

    await next();
  };
};
