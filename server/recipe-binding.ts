import type {Recipe} from '../shared/types.ts';
/** Literal token substitution, never eval or provider-field invention. Every
 * occurrence is bound. Replaced reference subjects default to the new reference
 * rather than silently retaining a previous character's name or wardrobe. */
export function bindRecipeIngredients(recipe:Recipe,replacements:Record<string,string>,values:Record<string,string>={}){
 const ingredients=recipe.ingredients||[],requirements:string[]=[],resolvedIngredients:Record<string,string>={};
 for(const key of Object.keys(values))if(!ingredients.some(i=>i.key===key))requirements.push('Unknown recipe ingredient: '+key);
 for(const ingredient of ingredients){const refReplaced=!!replacements[ingredient.key];resolvedIngredients[ingredient.key]=(values[ingredient.key]??(refReplaced?'the subject shown in the replacement reference':ingredient.defaultValue)).trim();if(!resolvedIngredients[ingredient.key])requirements.push('Describe '+ingredient.label.toLowerCase()+'.');}
 let prompt=recipe.prompt;
 if(recipe.promptTemplate){prompt=recipe.promptTemplate.replace(/\{\{([a-z][a-z0-9_]*)\}\}/gi,(_match,key)=>{if(!(key in resolvedIngredients)){requirements.push('Missing template ingredient: '+key);return ''; }return resolvedIngredients[key];});}
 else if(Object.keys(replacements).length&&/\bMara\b|yellow (?:rain)?coat/i.test(prompt))requirements.push('This older recipe has fixed character instructions. Add a subject/wardrobe prompt template before replacing its reference.');
 if(prompt.length>20000)requirements.push('The resolved prompt is longer than 20,000 characters.');
 return {ingredients,resolvedIngredients,prompt,requirements};
}
