# Cypher — 常用命令
.PHONY: help up down build test lint clean

help:           ## 显示帮助
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

up:             ## 启动全栈 (db + server + frontend + engine)
	docker compose up -d

down:           ## 停止并清理
	docker compose down -v

build:          ## 构建 Cypher 引擎镜像
	docker compose build cypher

rebuild:        ## 强制重新构建 (无缓存)
	docker compose build --no-cache cypher

logs:           ## 查看引擎日志
	docker compose logs -f cypher

test:           ## 运行单元测试
	cd src && python -m pytest ../tests -v -m "not integration"

test-all:       ## 运行全部测试 (含集成)
	cd src && python -m pytest ../tests -v

lint:           ## 代码检查
	cd src && flake8 . ../tests --count --select=E9,F63,F7,F82 --statistics

shell:          ## 进入引擎容器
	docker compose exec cypher /bin/bash

lookup-build:   ## 构建 NTLM 预计算查表
	docker compose run --rm lookup-builder

lookup-check:   ## 查表检测 hash 文件 (用法: make lookup-check HASHFILE=hash.txt)
	python3 -m src.ntlm_lookup --check $(HASHFILE) --db /data/lookup/ntlm_precomputed.txt

report:         ## 生成报告 (用法: make report CRACKED=result.csv)
	python3 -m src.report_generator --cracked $(CRACKED) --output report.html

clean:          ## 清理临时文件
	rm -rf __pycache__ .pytest_cache src/__pycache__ tests/__pycache__
	find . -name '*.pyc' -delete
