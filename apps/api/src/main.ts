import express from 'express';
import { ProductsService } from '@org/api/products';
import {
  ApiResponse,
  Product,
  ProductFilter,
  PaginatedResponse,
} from '@org/models';
import {
  errorHandler,
  notFoundHandler,
  asyncHandler,
} from './middleware/error.middleware';
import {
  validateProductFilter,
  validateProductId,
} from './middleware/validation.middleware';
import { configureCors } from './config/cors.config';
import { config } from './config/config';

const app = express();
const productsService = new ProductsService();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
configureCors(app);

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.0.0',
      environment: config.server.nodeEnv,
    },
  });
});

// Products endpoints
app.get(
  '/api/products',
  validateProductFilter,
  asyncHandler(async (req, res) => {
    const filter: ProductFilter = {};

    if (req.query.category) {
      filter.category = req.query.category as string;
    }
    if (req.query.minPrice) {
      filter.minPrice = Number(req.query.minPrice);
    }
    if (req.query.maxPrice) {
      filter.maxPrice = Number(req.query.maxPrice);
    }
    if (req.query.inStock !== undefined) {
      filter.inStock = req.query.inStock === 'true';
    }
    if (req.query.searchTerm) {
      filter.searchTerm = req.query.searchTerm as string;
    }

    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 12;

    const result = productsService.getAllProducts(filter, page, pageSize);

    const response: ApiResponse<PaginatedResponse<Product>> = {
      data: result,
      success: true,
    };

    res.json(response);
  }),
);

app.get(
  '/api/products/:id',
  validateProductId,
  asyncHandler(async (req, res) => {
    const product = productsService.getProductById(req.params.id);

    if (!product) {
      const response: ApiResponse<null> = {
        data: null,
        success: false,
        error: 'Product not found',
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse<Product> = {
      data: product,
      success: true,
    };

    res.json(response);
  }),
);

app.get(
  '/api/products-metadata/categories',
  asyncHandler(async (req, res) => {
    const categories = productsService.getCategories();
    const response: ApiResponse<string[]> = {
      data: categories,
      success: true,
    };
    res.json(response);
  }),
);

app.get(
  '/api/products-metadata/price-range',
  asyncHandler(async (req, res) => {
    const priceRange = productsService.getPriceRange();
    const response: ApiResponse<{ min: number; max: number }> = {
      data: priceRange,
      success: true,
    };
    res.json(response);
  }),
);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(config.server.port, config.server.host, () => {
  console.log(
    `[ ready ] API server running at http://${config.server.host}:${config.server.port}`,
  );
  console.log(`[ env   ] Environment: ${config.server.nodeEnv}`);
});
