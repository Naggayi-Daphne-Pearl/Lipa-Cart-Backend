import type { Schema, Struct } from '@strapi/strapi';

export interface ListItem extends Struct.ComponentSchema {
  collectionName: 'components_list_items';
  info: {
    description: 'Shopping list item';
    displayName: 'Item';
  };
  attributes: {
    budget_amount: Schema.Attribute.Decimal;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    notes: Schema.Attribute.String;
    product: Schema.Attribute.Relation<'oneToOne', 'api::product.product'>;
    quantity: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<1>;
    unit: Schema.Attribute.String;
  };
}

export interface RecipeIngredient extends Struct.ComponentSchema {
  collectionName: 'components_recipe_ingredients';
  info: {
    description: 'Recipe ingredient';
    displayName: 'Ingredient';
  };
  attributes: {
    name: Schema.Attribute.String & Schema.Attribute.Required;
    notes: Schema.Attribute.String;
    product: Schema.Attribute.Relation<'oneToOne', 'api::product.product'>;
    quantity: Schema.Attribute.Decimal;
    unit: Schema.Attribute.String;
  };
}

export interface RecipeInstruction extends Struct.ComponentSchema {
  collectionName: 'components_recipe_instructions';
  info: {
    description: 'Recipe instruction step';
    displayName: 'Instruction';
  };
  attributes: {
    description: Schema.Attribute.Text & Schema.Attribute.Required;
    duration_minutes: Schema.Attribute.Integer;
    step_number: Schema.Attribute.Integer & Schema.Attribute.Required;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'list.item': ListItem;
      'recipe.ingredient': RecipeIngredient;
      'recipe.instruction': RecipeInstruction;
    }
  }
}
