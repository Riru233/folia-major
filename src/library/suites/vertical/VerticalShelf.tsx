import React from 'react';

// src/library/suites/vertical/VerticalShelf.tsx
// 树形首页一条分支里的横向封面架：封面 + 名字 + 一行副标题，横向滚动。抽出来是因为歌单 / 推荐 / 专辑 / 本地四组
// 都是同一份东西；宽度写死在架子上，窗口窄了它自己滚，树的结构不变。

export type VerticalShelfItem = {
    id: string | number;
    name: React.ReactNode;
    coverUrl?: string;
    description?: string;
};

type VerticalShelfProps = {
    items: readonly VerticalShelfItem[];
    isLoading?: boolean;
    emptyMessage?: string;
    onSelect: (item: VerticalShelfItem, index: number) => void;
    loadingLabel?: string;
};

const VerticalShelf: React.FC<VerticalShelfProps> = ({ items, isLoading = false, emptyMessage, onSelect, loadingLabel }) => {
    if (isLoading) {
        return <div className="vertical-shelf-note">{loadingLabel ?? ''}</div>;
    }
    if (items.length === 0) {
        return <div className="vertical-shelf-note">{emptyMessage ?? ''}</div>;
    }
    return (
        <div className="vertical-shelf" role="list">
            {items.map((item, index) => (
                <button
                    key={item.id}
                    type="button"
                    role="listitem"
                    className="vertical-shelf-card"
                    title={item.description || (typeof item.name === 'string' ? item.name : undefined)}
                    onClick={() => onSelect(item, index)}
                >
                    <span className="vertical-shelf-cover">
                        {item.coverUrl
                            ? <img src={item.coverUrl} alt="" draggable={false} loading="lazy" />
                            : <span aria-hidden className="vertical-shelf-fallback" />}
                    </span>
                    <span className="vertical-shelf-name">{item.name}</span>
                    {item.description && <span className="vertical-shelf-sub">{item.description}</span>}
                </button>
            ))}
        </div>
    );
};

export default VerticalShelf;
