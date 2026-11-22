import React from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// src/components/modal/settings/navigation/SettingsSearchField.tsx
// 设置的搜索框：宽屏时在侧栏顶端，紧凑档时在顶栏的菜单按钮右边，两处共用这一个受控输入框。
// 回车交给调用方（跳到第一条命中）；Escape 先清空查询，只有空的时候才让出去关掉整个弹窗。

type SettingsSearchFieldProps = {
    query: string;
    onQueryChange: (query: string) => void;
    /** 回车：由调用方决定要不要落到第一条命中。 */
    onSubmitQuery: () => void;
    className?: string;
};

export const SettingsSearchField: React.FC<SettingsSearchFieldProps> = ({
    query,
    onQueryChange,
    onSubmitQuery,
    className = '',
}) => {
    const { t } = useTranslation();

    const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            onSubmitQuery();
            return;
        }
        // The first Escape clears the query; only an empty box lets it through to close the dialog.
        if (event.key === 'Escape' && query) {
            event.preventDefault();
            event.stopPropagation();
            onQueryChange('');
        }
    };

    return (
        /* 搜索框是侧栏顶端唯一一块会「浮」起来的东西，给它一层液态玻璃：胶囊形（h-8 → 圆角 16px 吃满
           高度，圆角才是饱和的半圆），边缘靠 data-glass 的位移图折射侧栏背后的窗口玻璃，再加上
           data-glass-light 的指针光晕。bend 取 10（小于半高），折射带不会啃到中间的文字；
           strength/blur 都比窗口那层小，小控件上折射太强会像水珠。里面装着 input，按压缩放会自动跳过。 */
        <div
            data-glass
            data-glass-light
            data-glass-jelly
            className={`flex h-8 items-center gap-2 rounded-full border border-transparent bg-[var(--st-fill)] px-3 text-[color:var(--st-t3)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-colors focus-within:border-[var(--st-line2)] ${className}`}
            style={{
                borderTop: '1px solid #fff6',
                borderBottom: '1px solid #fff6',
                outline: '1px solid rgba(35,35,35,0.3)',
                boxShadow: '0px 8px 16px rgba(40,40,40,0.2)'
            }}
        >
            <Search size={14} className="shrink-0" />
            <input
                type="search"
                value={query}
                onChange={event => onQueryChange(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t('options.settingsSearchPlaceholder')}
                aria-label={t('options.settingsSearchPlaceholder')}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[color:var(--st-t1)] outline-none placeholder:text-[color:var(--st-t3)] [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
                <button
                    type="button"
                    onClick={() => onQueryChange('')}
                    aria-label={t('options.settingsSearchClear')}
                    className="shrink-0 transition-colors hover:text-[color:var(--st-t1)]"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
};

export default SettingsSearchField;
