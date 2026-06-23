import pandas as pd
import numpy as np
from sklearn.datasets import fetch_openml
import warnings
warnings.filterwarnings('ignore')

# Step 1: Download Boston Housing dataset
print("=" * 60)
print("Step 1: Downloading Boston Housing Dataset")
print("=" * 60)
boston = fetch_openml(name='boston', version=1, as_frame=True)
df = boston.frame
print(f"Shape: {df.shape}")
print(f"Columns: {df.columns.tolist()}")
df.to_csv('boston_housing.csv', index=False)
print("Saved as boston_housing.csv")

# Convert all columns to numeric
for col in df.columns:
    df[col] = pd.to_numeric(df[col], errors='coerce')
df = df.dropna()

print(f"\nData types:\n{df.dtypes}")
print(f"\nFirst 5 rows:\n{df.head()}")

# Step 2: Check medv outliers using IQR method
print("\n" + "=" * 60)
print("Step 2: medv Outlier Detection (IQR Method)")
print("=" * 60)
medv = df['medv']
Q1 = medv.quantile(0.25)
Q3 = medv.quantile(0.75)
IQR = Q3 - Q1
lower_bound = Q1 - 1.5 * IQR
upper_bound = Q3 + 1.5 * IQR
outliers = df[(medv < lower_bound) | (medv > upper_bound)]
print(f"Q1 (25%): {Q1}")
print(f"Q3 (75%): {Q3}")
print(f"IQR: {IQR}")
print(f"Lower bound: {lower_bound}")
print(f"Upper bound: {upper_bound}")
print(f"Number of outliers: {len(outliers)}")
print(f"Outlier percentage: {len(outliers)/len(df)*100:.2f}%")
if len(outliers) > 0:
    print(f"\nOutlier values:\n{outliers['medv'].values}")

# Step 3: Top 3 features correlated with medv (Pearson)
print("\n" + "=" * 60)
print("Step 3: Top 3 Features Most Correlated with medv")
print("=" * 60)
correlations = df.corr()['medv'].drop('medv').abs().sort_values(ascending=False)
print("Top 3 features by absolute Pearson correlation:")
for i, (feature, corr) in enumerate(correlations.head(3).items(), 1):
    actual_corr = df.corr()['medv'][feature]
    print(f"  {i}. {feature}: {actual_corr:.4f}")

# Step 4: Create rm_rounded and calculate group averages
print("\n" + "=" * 60)
print("Step 4: rm_rounded Group Average Prices")
print("=" * 60)
df['rm_rounded'] = df['rm'].round()
group_avg = df.groupby('rm_rounded')['medv'].mean()
print("Average medv by rm_rounded:")
print(group_avg.to_string())

# Step 5: Plot scatter plot with trend line
print("\n" + "=" * 60)
print("Step 5: Creating Scatter Plot with Trend Line")
print("=" * 60)
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy import stats

fig, ax = plt.subplots(figsize=(10, 6))
ax.scatter(df['rm'], df['medv'], alpha=0.5, label='Data points')

# Trend line
slope, intercept, r_value, p_value, std_err = stats.linregress(df['rm'], df['medv'])
x_line = np.linspace(df['rm'].min(), df['rm'].max(), 100)
y_line = slope * x_line + intercept
ax.plot(x_line, y_line, 'r-', linewidth=2, label=f'Trend line (y={slope:.2f}x+{intercept:.2f})')

ax.set_xlabel('RM (Average Rooms)', fontsize=12)
ax.set_ylabel('MEDV (Median Value in $1000s)', fontsize=12)
ax.set_title('RM vs MEDV with Trend Line', fontsize=14)
ax.legend()
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('rm_vs_medv_scatter.png', dpi=150)
print("Saved as rm_vs_medv_scatter.png")

# Step 6: Save cleaned data (remove outliers)
print("\n" + "=" * 60)
print("Step 6: Saving Cleaned Data (Removing Outliers)")
print("=" * 60)
df_clean = df[(medv >= lower_bound) & (medv <= upper_bound)].copy()
df_clean.to_csv('boston_clean.csv', index=False)
print(f"Original rows: {len(df)}")
print(f"Cleaned rows: {len(df_clean)}")
print(f"Removed: {len(df) - len(df_clean)} rows")
print("Saved as boston_clean.csv")

print("\n" + "=" * 60)
print("Analysis Complete!")
print("=" * 60)
