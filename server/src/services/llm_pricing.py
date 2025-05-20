"""
LLMモデルの価格計算サービス
"""


class LLMPricing:
    """LLMモデルの価格計算クラス"""

    PRICING: dict[str, dict[str, dict[str, float]]] = {
        "openai": {
            "gpt-4o-mini": {"input": 0.15, "output": 0.60},
            "gpt-4o": {"input": 2.50, "output": 10.00},
            "o3-mini": {"input": 1.10, "output": 4.40},
        },
        "azure": {
            "gpt-4o-mini": {"input": 0.15, "output": 0.60},
            "gpt-4o": {"input": 2.50, "output": 10.00},
            "o3-mini": {"input": 1.10, "output": 4.40},
        },
        "openrouter": {
            "gpt-4o-mini": {"input": 0.15, "output": 0.60},
            "gpt-4o": {"input": 2.50, "output": 10.00},
            "o3-mini": {"input": 1.10, "output": 4.40},
        },
    }

    DEFAULT_PRICE = {"input": 0.01, "output": 0.03}  # デフォルト価格（不明なモデル用）

    @classmethod
    def calculate_cost(cls, provider: str, model: str, token_usage_input: int, token_usage_output: int) -> float:
        """
        トークン使用量から推定コストを計算する

        Args:
            provider: LLMプロバイダー名
            model: モデル名
            token_usage_input: 入力トークン使用量
            token_usage_output: 出力トークン使用量

        Returns:
            float: 推定コスト（USD）
        """
        if provider not in cls.PRICING:
            return cls._calculate_with_price(cls.DEFAULT_PRICE, token_usage_input, token_usage_output)

        if model not in cls.PRICING[provider]:
            return cls._calculate_with_price(cls.DEFAULT_PRICE, token_usage_input, token_usage_output)

        price = cls.PRICING[provider][model]
        return cls._calculate_with_price(price, token_usage_input, token_usage_output)

    @staticmethod
    def _calculate_with_price(price: dict[str, float], token_usage_input: int, token_usage_output: int) -> float:
        """
        価格情報とトークン使用量から推定コストを計算する

        Args:
            price: 価格情報（inputとoutputの価格）
            token_usage_input: 入力トークン使用量
            token_usage_output: 出力トークン使用量

        Returns:
            float: 推定コスト（USD）
        """
        input_cost = (token_usage_input / 1_000_000) * price["input"]
        output_cost = (token_usage_output / 1_000_000) * price["output"]
        total_cost = input_cost + output_cost
        return total_cost

    @classmethod
    def format_cost(cls, cost: float) -> str:
        """
        コストを表示用にフォーマットする

        Args:
            cost: コスト値

        Returns:
            str: フォーマットされたコスト文字列
        """
        return f"${cost:.4f}"
