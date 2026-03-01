import { factories } from '@strapi/strapi';

// Use default core router - auth checks happen in controller
export default factories.createCoreRouter('api::product.product');
