import { getItemStudioRecordByKey } from '../items/itemStudioStore';
import type { ShopStudioRecord, ShopValidationIssue } from './shopStudioTypes';

export function validateShop(record: ShopStudioRecord): ShopValidationIssue[] {
  const issues: ShopValidationIssue[] = [];
  if (!record.name.trim()) issues.push({ severity: 'error', code: 'name', message: 'A loja precisa de um nome.' });
  if (!record.key.trim()) issues.push({ severity: 'error', code: 'key', message: 'A loja precisa de uma chave interna.' });
  if (record.currency.type === 'item' && !record.currency.itemId) issues.push({ severity: 'error', code: 'currency', message: 'Selecione o item usado como moeda.' });
  if (record.currency.type === 'item' && record.currency.itemId && !getItemStudioRecordByKey(record.currency.itemId)) issues.push({ severity: 'error', code: 'currency-missing', message: 'O item usado como moeda não existe no Item Studio.' });
  if (!record.items.length) issues.push({ severity: 'warning', code: 'empty-stock', message: 'A loja não possui itens no estoque.' });
  const seen = new Set<string>();
  for (const item of record.items) {
    if (!item.itemId || !getItemStudioRecordByKey(item.itemId)) issues.push({ severity: 'error', code: 'item-missing', message: `Item inexistente no estoque: ${item.itemId || '(vazio)'}.` });
    if (seen.has(item.itemId)) issues.push({ severity: 'warning', code: 'duplicate-item', message: `O item ${item.itemId} aparece mais de uma vez no estoque.` });
    seen.add(item.itemId);
    if (item.buyPrice < 0) issues.push({ severity: 'error', code: 'price', message: 'Preço de compra não pode ser negativo.' });
    if (item.stock.mode === 'limited' && item.stock.quantity <= 0) issues.push({ severity: 'error', code: 'stock', message: `Estoque limitado de ${item.itemId} precisa ser maior que zero.` });
    if (item.stock.restock === 'minutes' && !item.stock.intervalMinutes) issues.push({ severity: 'error', code: 'restock', message: `Reposição por minutos de ${item.itemId} precisa de intervalo.` });
  }
  if (record.allowSell && !record.acceptedCategories.length) issues.push({ severity: 'warning', code: 'accepts', message: 'Venda do jogador está habilitada, mas nenhuma categoria é aceita.' });
  if (record.status === 'published' && issues.some((issue) => issue.severity === 'error')) issues.push({ severity: 'error', code: 'publish', message: 'Corrija os erros críticos antes de publicar.' });
  return issues;
}
